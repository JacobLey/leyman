import type { FloorPackageJson } from './floor.js';
import type { PackWith } from './root.js';
import type { Profile } from './types-resolution.js';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import Path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCwd } from 'parse-cwd';
import { declarationProblems } from './declarations.js';
import { floorProblems } from './floor.js';
import { lintProblems } from './lint.js';
import { pack } from './pack.js';
import { defaultNotPublished, publishedFilesProblems } from './published-files.js';
import { resolveRoot } from './root.js';
import { typesResolutionProblems } from './types-resolution.js';

/**
 * Options of {@link checkPackage}.
 */
export interface CheckPackageOptions {
    /**
     * The package directory.
     *
     * @default process.cwd()
     */
    readonly cwd?: string | URL;
    /**
     * The workspace root: where `.gitignore` files start to apply, and what a relative
     * `floorTsconfig` starts from. Defaults to the nearest directory with a lockfile, from the package up.
     */
    readonly root?: string | URL;
    /**
     * The package manager that packs the package. Defaults to the one the root's lockfile belongs to.
     */
    readonly packWith?: PackWith;
    /**
     * The module resolutions every entry point must work under.
     *
     * @default 'strict'
     */
    readonly profile?: Profile;
    /**
     * Top-level paths that are never published, besides {@link defaultNotPublished}.
     */
    readonly notPublished?: readonly string[];
    /**
     * The config the package's `tsconfig.json` must extend, with `{major}` for the support floor:
     * a package specifier, matched as written (`@scope/configs/tsconfig.node-{major}.json`), or a
     * path relative to the root starting with `./` or `../` (`./configs/tsconfig.node-{major}.json`).
     * Not checked by default.
     */
    readonly floorTsconfig?: string;
    /**
     * Path of `tsc`. Defaults to the nearest `node_modules/.bin/tsc`, from the package up.
     */
    readonly tsc?: string | URL;
}

/**
 * What {@link checkPackage} found.
 */
export interface CheckPackageResult {
    /**
     * Each problem, which should fail a CI run.
     */
    readonly problems: readonly string[];
    /**
     * Publint's suggestions, which are worth reading but don't fail anything.
     */
    readonly suggestions: readonly string[];
    /**
     * Whether the package has no entry point, so only its published files and publint were checked.
     */
    readonly filesOnly: boolean;
}

/**
 * The `package.json` fields that give a package code to load: an import or `require`, a command, or types.
 */
const entryPointFields = ['bin', 'exports', 'main', 'module', 'types', 'typings'] as const;

/**
 * What Node.js loads for `require('<package>')` when there is no `main` or `exports`.
 * See {@link https://nodejs.org/api/modules.html#all-together LOAD_INDEX}.
 */
const defaultIndexFiles = new Set(['index.js', 'index.json', 'index.node']);

/**
 * Whether the package has an entry point: one of {@link entryPointFields}, or an index file Node.js loads in place of
 * `main`. A package without one publishes only files read by path (configs, schemas), so there is nothing to
 * resolve types for, no declarations to compile against, and no Node.js that runs it.
 *
 * @param packageJson - its `entryPointFields`
 * @param files - the paths in the tarball
 * @returns whether it has an entry point
 */
const hasEntryPoint = (
    packageJson: Readonly<Partial<Record<(typeof entryPointFields)[number], unknown>>>,
    files: readonly string[]
): boolean =>
    entryPointFields.some(field => packageJson[field] !== undefined) ||
    files.some(file => defaultIndexFiles.has(file));

const toPath = (path: string | URL): string =>
    path instanceof URL ? fileURLToPath(path) : Path.resolve(path);

/**
 * Checks a package exactly as it would be published. Packs it with the workspace's package manager,
 * then runs publint and Are The Types Wrong on the tarball, type checks its published declarations
 * strictly, checks its support floor against `@types/node` and its runtime dependencies, and checks
 * every top-level path is either published or known not to be.
 *
 * A package with no entry point (no `main`, `exports`, `bin` or types) is checked as files only:
 * publint and the published files, plus its runtime dependencies against `engines.node` if it has one.
 *
 * @param options - the package, and how to check it
 * @returns the problems found, and publint's suggestions
 * @throws {Error} a `CheckPackageError` when the check itself can't run: no workspace root or
 * package manager, or no `tsc` for a package that publishes declarations
 */
export const checkPackage = async (
    options: CheckPackageOptions = {}
): Promise<CheckPackageResult> => {
    const cwd = await parseCwd(options.cwd);
    const { packWith, root } = await resolveRoot({
        cwd,
        packWith: options.packWith,
        root: options.root === undefined ? undefined : toPath(options.root),
    });
    const packageJson = JSON.parse(
        await readFile(Path.join(cwd, 'package.json'), 'utf8')
    ) as FloorPackageJson & Partial<Record<(typeof entryPointFields)[number], unknown>>;
    const notPublished = new Set([...defaultNotPublished, ...(options.notPublished ?? [])]);

    const packDir = await mkdtemp(Path.join(tmpdir(), 'check-package-'));
    try {
        const { files, tarball } = await pack({ cwd, packDir, packWith });
        const tarballData = new Uint8Array(tarball);
        const isFilesOnly = !hasEntryPoint(packageJson, files);
        const [floor, published, lint, typesResolution, declarations] = await Promise.all([
            floorProblems({
                floorTsconfig: options.floorTsconfig,
                filesOnly: isFilesOnly,
                cwd,
                packageJson,
                root,
            }),
            publishedFilesProblems({ cwd, files, notPublished, root }),
            lintProblems(tarballData),
            isFilesOnly ? [] : typesResolutionProblems(tarballData, options.profile ?? 'strict'),
            isFilesOnly
                ? []
                : declarationProblems({
                      cwd,
                      files,
                      tsc: options.tsc === undefined ? null : toPath(options.tsc),
                  }),
        ]);
        return {
            problems: [
                ...floor,
                ...published,
                ...lint.problems,
                ...typesResolution,
                ...declarations,
            ],
            suggestions: lint.suggestions,
            filesOnly: isFilesOnly,
        };
    } finally {
        await rm(packDir, { force: true, recursive: true });
    }
};
