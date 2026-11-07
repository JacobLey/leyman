import type { Document } from 'yaml';
import { lstat, readFile, readlink } from 'node:fs/promises';
import Path from 'node:path';
import { glob } from 'tinyglobby';
import { parseDocument } from 'yaml';

type Dependencies = Readonly<Record<string, string>>;

/**
 * The fields of a `package.json` the checks read.
 */
export interface PackageJson {
    readonly name?: string;
    readonly private?: boolean;
    readonly engines?: { readonly node?: string };
    readonly scripts?: Dependencies;
    readonly dependencies?: Dependencies;
    readonly devDependencies?: Dependencies;
    readonly workspaces?: readonly string[] | { readonly packages?: readonly string[] };
    readonly c8?: unknown;
    readonly pnpm?: Readonly<Record<string, unknown>>;
}

/**
 * A package of the workspace.
 */
export interface WorkspacePackage {
    /**
     * Its directory, relative to the workspace root, `.` for the root itself.
     */
    readonly dir: string;
    readonly packageJson: PackageJson;
}

/**
 * The files of a repository the checks read, loaded once.
 */
export interface Workspace {
    /**
     * Absolute path of the repository root.
     */
    readonly root: string;
    readonly packageJson: PackageJson;
    /**
     * Each package the workspace lists, or the root package alone in a repository of one.
     */
    readonly packages: readonly WorkspacePackage[];
    /**
     * `pnpm-workspace.yaml`, with its comments.
     */
    readonly pnpmWorkspace: Document | undefined;
    /**
     * Reads a file relative to the root.
     *
     * @param path - relative to the root
     * @returns its text, or `undefined` if there is none
     */
    readonly read: (path: string) => Promise<string | undefined>;
    /**
     * Reads a JSON (or JSONC) file relative to the root.
     *
     * @param path - relative to the root
     * @returns its value, or `undefined` if there is none
     */
    readonly readJson: <T>(path: string) => Promise<T | undefined>;
    /**
     * Lists files relative to the root, leaving out installs and build output.
     *
     * @param patterns - globs relative to the root
     * @returns matching paths, sorted
     */
    readonly glob: (patterns: readonly string[]) => Promise<string[]>;
    /**
     * Where a symbolic link points.
     *
     * @param path - relative to the root
     * @returns its target, or `undefined` if the path is missing or not a link
     */
    readonly linkTarget: (path: string) => Promise<string | undefined>;
}

/**
 * Paths no check reads: installs, build and test output, and caches.
 */
export const ignoredPaths = [
    '**/node_modules/**',
    '**/dist/**',
    '**/dist-test/**',
    '**/coverage/**',
    '**/.nx/**',
    '**/.coverage/**',
] as const;

const commentOrString = /"(?:[^"\\]|\\.)*"|\/\/[^\n]*|\/\*.*?\*\//gsv;

/**
 * Parses JSON with comments and trailing commas, as `tsconfig.json` and `biome.jsonc` allow.
 *
 * @param text - the file's contents
 * @returns the parsed value
 */
export const parseJsonc = (text: string): unknown =>
    JSON.parse(
        text
            .replaceAll(commentOrString, match => (match.startsWith('"') ? match : ''))
            .replaceAll(/,(?<space>\s*)(?<close>[\]\}])/gv, '$<space>$<close>')
    );

const isMissing = (error: unknown): boolean => (error as { code?: unknown }).code === 'ENOENT';

const workspacePatterns = (
    packageJson: PackageJson,
    pnpmWorkspace: Document | undefined
): readonly string[] => {
    const fromPnpm = pnpmWorkspace?.toJS() as { packages?: readonly string[] } | null | undefined;
    if (fromPnpm?.packages !== undefined) {
        return fromPnpm.packages;
    }
    const { workspaces } = packageJson;
    return Array.isArray(workspaces)
        ? workspaces
        : ((workspaces as { readonly packages?: readonly string[] } | undefined)?.packages ?? []);
};

/**
 * Loads the files of the repository at `root` that the checks read.
 *
 * @param root - absolute path of the repository root
 * @returns its packages and settings, and functions to read its other files
 * @rejects {Error} when `root` has no `package.json`
 */
export const readWorkspace = async (root: string): Promise<Workspace> => {
    const read = async (path: string): Promise<string | undefined> => {
        try {
            return await readFile(Path.join(root, path), 'utf8');
        } catch (error) {
            if (isMissing(error)) {
                return undefined;
            }
            throw error;
        }
    };
    const readJson = async <T>(path: string): Promise<T | undefined> => {
        const text = await read(path);
        return text === undefined ? undefined : (parseJsonc(text) as T);
    };
    const globFiles = async (patterns: readonly string[]): Promise<string[]> => {
        const files = await glob([...patterns], {
            cwd: root,
            dot: true,
            ignore: [...ignoredPaths],
        });
        return files.toSorted((a, b) => a.localeCompare(b));
    };
    const linkTarget = async (path: string): Promise<string | undefined> => {
        try {
            const stats = await lstat(Path.join(root, path));
            return stats.isSymbolicLink() ? await readlink(Path.join(root, path)) : undefined;
        } catch (error) {
            if (isMissing(error)) {
                return undefined;
            }
            throw error;
        }
    };

    const packageJson = await readJson<PackageJson>('package.json');
    if (packageJson === undefined) {
        throw new Error(`No package.json in ${root}: run the audit from a repository's root`);
    }
    const yaml = await read('pnpm-workspace.yaml');
    const pnpmWorkspace = yaml === undefined ? undefined : parseDocument(yaml);

    const patterns = workspacePatterns(packageJson, pnpmWorkspace);
    const manifests = await globFiles(
        patterns.map(pattern =>
            pattern.startsWith('!')
                ? `!${pattern.slice(1)}/package.json`
                : `${pattern}/package.json`
        )
    );
    const packages = await Promise.all(
        manifests.map(async manifest => {
            const dir = Path.posix.dirname(manifest);
            return { dir, packageJson: (await readJson<PackageJson>(manifest))! };
        })
    );

    return {
        root,
        packageJson,
        pnpmWorkspace,
        read,
        readJson,
        linkTarget,
        packages: packages.length === 0 ? [{ dir: '.', packageJson }] : packages,
        glob: globFiles,
    };
};
