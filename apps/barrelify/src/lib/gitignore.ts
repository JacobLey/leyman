import type { Ignore } from 'ignore';
import { access, readFile } from 'node:fs/promises';
import Path from 'node:path';
import ignore from 'ignore';
import { glob } from 'tinyglobby';

/**
 * Returns true if the file is ignored by a `.gitignore`.
 */
export type IsGitignored = (filePath: string) => boolean;

interface Gitignore {
    dir: string;
    matcher: Ignore;
}

/**
 * Path of `child` relative to `parent`, or null if `child` is not strictly inside `parent`.
 *
 * @param parent - parent directory
 * @param child - path to test
 * @returns relative path, with `/` separators
 */
const relativeInside = (parent: string, child: string): string | null => {
    const relative = Path.relative(parent, child);
    if (
        relative === '' ||
        relative === '..' ||
        relative.startsWith(`..${Path.sep}`) ||
        Path.isAbsolute(relative)
    ) {
        return null;
    }
    return relative.replaceAll(Path.sep, '/');
};

/**
 * Find the closest directory containing `.git`, which is a file rather than a directory in
 * worktrees and submodules.
 *
 * @param dir - directory to start from
 * @returns Git root, or null if not in a Git repository
 */
const findGitRoot = async (dir: string): Promise<string | null> => {
    try {
        await access(Path.join(dir, '.git'));
        return dir;
    } catch {
        const parent = Path.dirname(dir);
        return parent === dir ? null : findGitRoot(parent);
    }
};

/**
 * `.gitignore` paths in every directory from `root` down to `dir`, excluding `dir` itself.
 *
 * @param root - Git root
 * @param dir - directory being searched
 * @returns `.gitignore` paths, shallowest first
 */
const parentGitignorePaths = (root: string, dir: string): string[] => {
    const relative = relativeInside(root, dir);
    if (relative === null) {
        return [];
    }
    const segments = relative.split('/');
    return segments.map((_, i) => Path.join(root, ...segments.slice(0, i), '.gitignore'));
};

/**
 * Read a `.gitignore`.
 *
 * @param filePath - path to `.gitignore`
 * @returns parsed rules, or null if the file does not exist
 */
const readGitignore = async (filePath: string): Promise<Gitignore | null> => {
    try {
        const content = await readFile(filePath, 'utf8');
        return { dir: Path.dirname(filePath), matcher: ignore().add(content) };
    } catch (error) {
        if (Error.isError(error) && 'code' in error && error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
};

/**
 * Whether a single path is ignored, ignoring whether its parent directories are.
 *
 * Every `.gitignore` above the path gets a say, and the last one with a matching rule decides.
 * That is the deepest one, so a nested `.gitignore` can re-include what a parent ignored.
 *
 * @param gitignores - `.gitignore` files, shallowest first
 * @param path - absolute path
 * @param isDirectory - directory patterns (`dist/`) only match directories
 * @returns true if ignored
 */
const isIgnoredPath = (
    gitignores: readonly Gitignore[],
    path: string,
    isDirectory: boolean
): boolean => {
    let isIgnored = false;
    for (const { dir, matcher } of gitignores) {
        const relative = relativeInside(dir, path);
        if (relative === null) {
            continue;
        }
        const result = matcher.test(isDirectory ? `${relative}/` : relative);
        if (result.ignored) {
            isIgnored = true;
        } else if (result.unignored) {
            isIgnored = false;
        }
    }
    return isIgnored;
};

/**
 * Load the `.gitignore` rules that apply to files in `dir`.
 *
 * Reads every `.gitignore` inside `dir` (skipping `node_modules`), and those in its parent
 * directories up to the Git root. Outside a Git repository, only those inside `dir`.
 *
 * `.git/info/exclude` and the global `core.excludesFile` are not read: they hold one user's
 * rules, which should not change what a shared tool sees.
 *
 * @param dir - directory to load rules for
 * @returns predicate for a file path (absolute, or relative to `dir`)
 */
export const loadGitignore = async (dir: string): Promise<IsGitignored> => {
    const resolvedDir = Path.resolve(dir);
    const root = (await findGitRoot(resolvedDir)) ?? resolvedDir;

    const nested = await glob('**/.gitignore', {
        cwd: resolvedDir,
        absolute: true,
        dot: true,
        expandDirectories: false,
        // Not part of the project, and slow to crawl
        ignore: ['**/node_modules/**', '**/.git/**'],
    });

    const gitignores = await Promise.all(
        [
            ...parentGitignorePaths(root, resolvedDir),
            // Rules from deeper files must come later, so they take precedence.
            // Only a file's ancestors need to come first, and their paths are always shorter.
            ...nested.toSorted((a, b) => a.length - b.length),
        ].map(async filePath => readGitignore(filePath))
    );
    const found = gitignores.filter(gitignore => gitignore !== null);

    return filePath => {
        const absolute = Path.resolve(resolvedDir, filePath);
        const relative = relativeInside(root, absolute);
        if (relative === null) {
            return false;
        }

        // Git does not look inside an ignored directory, so nothing in it can be re-included
        const segments = relative.split('/');
        return segments.some((_, i) =>
            isIgnoredPath(
                found,
                Path.join(root, ...segments.slice(0, i + 1)),
                i < segments.length - 1
            )
        );
    };
};
