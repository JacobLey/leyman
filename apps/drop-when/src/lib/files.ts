import type { Dirent } from 'node:fs';
import type { Ignore } from 'ignore';
import { lstat, readdir, readFile } from 'node:fs/promises';
import Path from 'node:path';
import ignore from 'ignore';

/**
 * What to scan, as given on the command line.
 */
export interface Selection {
    /**
     * Files or directories to scan, relative to the working directory. Empty scans all of it.
     */
    readonly paths: readonly string[];
    /**
     * Files, or directories to leave out everything under, relative to the working directory.
     */
    readonly exclude: readonly string[];
}

/**
 * The rules of one `.gitignore`, and the directory they are relative to (`''` for the working directory).
 */
interface Rules {
    readonly dir: string;
    readonly matcher: Ignore;
}

/**
 * Whether a path is a directory or inside it.
 *
 * @param path - a relative path, with `/` separators
 * @param parent - a relative path, `''` for the working directory
 * @returns whether `path` is `parent` or inside it
 */
const isWithin = (path: string, parent: string): boolean =>
    parent === '' || path === parent || path.startsWith(`${parent}/`);

/**
 * Whether a path is ignored, given that its parent directory isn't. Every `.gitignore` above it gets a say, and the
 * deepest with a matching rule decides, so a nested `.gitignore` can re-include what a parent ignored.
 *
 * @param rules - `.gitignore` rules from the working directory down to the path's directory, shallowest first
 * @param path - relative path
 * @param isDirectory - directory patterns (`dist/`) only match directories
 * @returns whether it is ignored
 */
const isIgnored = (rules: readonly Rules[], path: string, isDirectory: boolean): boolean => {
    let isPathIgnored = false;
    for (const { dir, matcher } of rules) {
        const relative = dir === '' ? path : path.slice(dir.length + 1);
        const result = matcher.test(isDirectory ? `${relative}/` : relative);
        if (result.ignored) {
            isPathIgnored = true;
        } else if (result.unignored) {
            isPathIgnored = false;
        }
    }
    return isPathIgnored;
};

/**
 * Turns a path from the command line into one relative to the working directory, with `/` separators.
 *
 * @param cwd - the working directory
 * @param path - as given
 * @returns the relative path (`''` for the working directory itself), or what is wrong with it
 */
const normalize = async (
    cwd: string,
    path: string
): Promise<{ readonly error: string } | { readonly path: string }> => {
    const absolute = Path.resolve(cwd, path);
    const relative = Path.relative(cwd, absolute);
    if (relative.split(Path.sep)[0] === '..') {
        return { error: `${path} is outside the working directory` };
    }
    try {
        await lstat(absolute);
    } catch {
        return { error: `${path} does not exist` };
    }
    return { path: relative.split(Path.sep).join('/') };
};

/**
 * Lists the files to scan: everything under the working directory that no `.gitignore` ignores, the way Git decides
 * which untracked files it would add. So the same files are listed with or without a Git repository (in CI, say), and
 * nothing ignored (`node_modules`, build output) ever is.
 *
 * It walks down from the working directory, reading each directory's `.gitignore`, with negations, and never enters
 * an ignored directory, as Git doesn't. It always skips `.git`. It reads no `.gitignore` above the working directory,
 * nor `.git/info/exclude` or a global excludes file, which hold one user's rules. Symbolic links are skipped: a
 * link's target is listed itself when it is inside the working directory.
 *
 * @param cwd - the working directory
 * @param selection - what to scan, and leave out
 * @returns paths relative to `cwd` with `/` separators, sorted, or what is wrong with a given path
 */
export const listFiles = async (
    cwd: string,
    selection: Selection
): Promise<{ readonly error: string } | { readonly files: string[] }> => {
    const normalized = await Promise.all(
        [...selection.paths, ...selection.exclude].map(async path => normalize(cwd, path))
    );
    const problems = normalized.filter(result => 'error' in result).map(result => result.error);
    if (problems.length > 0) {
        return { error: problems.join('\n') };
    }
    const relative = normalized.map(result => (result as { readonly path: string }).path);
    const paths = selection.paths.length === 0 ? [''] : relative.slice(0, selection.paths.length);
    const exclude = relative.slice(selection.paths.length);

    const files: string[] = [];
    const walk = async (dir: string, parentRules: readonly Rules[]): Promise<void> => {
        const entries: Dirent[] = await readdir(Path.join(cwd, dir), { withFileTypes: true });
        const gitignore = entries.find(entry => entry.name === '.gitignore' && entry.isFile());
        const rules =
            gitignore === undefined
                ? parentRules
                : [
                      ...parentRules,
                      {
                          dir,
                          matcher: ignore().add(
                              await readFile(Path.join(cwd, dir, '.gitignore'), 'utf8')
                          ),
                      },
                  ];

        for (const entry of entries) {
            const path = dir === '' ? entry.name : `${dir}/${entry.name}`;
            if (entry.name === '.git' || exclude.some(excluded => isWithin(path, excluded))) {
                continue;
            }
            if (entry.isDirectory()) {
                // On the way to a path to scan, or inside one
                const isWanted = paths.some(
                    wanted => isWithin(path, wanted) || isWithin(wanted, path)
                );
                if (isWanted && !isIgnored(rules, path, true)) {
                    // One directory at a time, which keeps few files open
                    await walk(path, rules);
                }
            } else if (
                entry.isFile() &&
                paths.some(wanted => isWithin(path, wanted)) &&
                !isIgnored(rules, path, false)
            ) {
                files.push(path);
            }
        }
    };
    await walk('', []);

    return { files: files.toSorted((a, b) => Number(a > b) - Number(a < b)) };
};

/**
 * Reads a listed file as text.
 *
 * @param cwd - what `path` is relative to
 * @param path - a path `listFiles()` returned
 * @returns its text, or `null` for a binary file (with a NUL byte, as Git decides)
 */
export const readText = async (cwd: string, path: string): Promise<string | null> => {
    const content = await readFile(Path.join(cwd, path));
    return content.includes(0) ? null : content.toString('utf8');
};
