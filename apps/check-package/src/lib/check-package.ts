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
     * The workspace root: where `.gitignore` files start to apply, and what `floorTsconfig` is
     * relative to. Defaults to the nearest directory with a lockfile, from the package up.
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
     * Path of the config the package's `tsconfig.json` must extend, relative to the root, with
     * `{major}` for the support floor, e.g. `configs/tsconfig.node-{major}.json`. Not checked by default.
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
}

const toPath = (path: string | URL): string =>
    path instanceof URL ? fileURLToPath(path) : Path.resolve(path);

/**
 * Checks a package exactly as it would be published. Packs it with the workspace's package manager,
 * then runs publint and Are The Types Wrong on the tarball, type checks its published declarations
 * strictly, checks its support floor against `@types/node` and its runtime dependencies, and checks
 * every top-level path is either published or known not to be.
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
    ) as FloorPackageJson;
    const notPublished = new Set([...defaultNotPublished, ...(options.notPublished ?? [])]);

    const packDir = await mkdtemp(Path.join(tmpdir(), 'check-package-'));
    try {
        const { files, tarball } = await pack({ cwd, packDir, packWith });
        const tarballData = new Uint8Array(tarball);
        const [floor, published, lint, typesResolution, declarations] = await Promise.all([
            floorProblems({ floorTsconfig: options.floorTsconfig, cwd, packageJson, root }),
            publishedFilesProblems({ cwd, files, notPublished, root }),
            lintProblems(tarballData),
            typesResolutionProblems(tarballData, options.profile ?? 'strict'),
            declarationProblems({
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
        };
    } finally {
        await rm(packDir, { force: true, recursive: true });
    }
};
