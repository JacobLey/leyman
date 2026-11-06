import type { Ignore } from 'ignore';
import { readdir, readFile } from 'node:fs/promises';
import Path from 'node:path';
import ignore from 'ignore';
import { isPresent } from './installed.js';

/**
 * Top-level paths a package keeps out of `files` by default: ignore files, its source, tests, and
 * the configs of its tools.
 */
export const defaultNotPublished: readonly string[] = [
    // Never packed by npm or pnpm
    '.gitignore',
    '.npmignore',
    'CHANGELOG.md',
    'biome.json',
    'eslint.config.js',
    'project.json',
    'src',
    'test',
    'tsconfig.json',
    // Ambient declarations for untyped dependencies, used only to compile the source
    'types.d.ts',
];

/**
 * The `.gitignore` files that apply to the package: each one from the workspace root down to it.
 *
 * @param root - the workspace root
 * @param cwd - the package directory
 * @returns each `.gitignore`'s directory and rules
 */
const gitignores = async (
    root: string,
    cwd: string
): Promise<{ directory: string; rules: Ignore }[]> => {
    const segments = Path.relative(root, cwd)
        .split(Path.sep)
        .filter(segment => segment !== '');
    const directories = [
        root,
        ...segments.map((_segment, index) => Path.join(root, ...segments.slice(0, index + 1))),
    ];
    const found = await Promise.all(
        directories.map(async directory => {
            const path = Path.join(directory, '.gitignore');
            return (await isPresent(path))
                ? { directory, rules: ignore().add(await readFile(path, 'utf8')) }
                : null;
        })
    );
    return found.filter(gitignore => gitignore !== null);
};

/**
 * Checks every top-level path of the package that Git doesn't ignore is either published or known
 * not to be, so a new one (like `data/`) can't be left out of `files` by accident, and nothing known
 * not to be published is.
 *
 * @param params - the package, what it publishes and what it never does, and the workspace root
 * @param params.cwd - the package directory
 * @param params.files - the paths in the tarball
 * @param params.notPublished - top-level paths that are never published
 * @param params.root - the workspace root
 * @returns each problem found
 */
export const publishedFilesProblems = async ({
    cwd,
    files,
    notPublished,
    root,
}: {
    cwd: string;
    files: readonly string[];
    notPublished: ReadonlySet<string>;
    root: string;
}): Promise<string[]> => {
    const published = new Set(files.map(file => file.split('/', 1)[0]));
    const [rules, entries] = await Promise.all([
        gitignores(root, cwd),
        readdir(cwd, { withFileTypes: true }),
    ]);
    const problems: string[] = [];
    for (const entry of entries) {
        const path = Path.join(cwd, entry.name);
        const suffix = entry.isDirectory() ? '/' : '';
        if (
            entry.name === '.git' ||
            rules.some(({ directory, rules: ignored }) =>
                ignored.ignores(
                    `${Path.relative(directory, path).replaceAll(Path.sep, '/')}${suffix}`
                )
            )
        ) {
            continue;
        }
        if (published.has(entry.name) && notPublished.has(entry.name)) {
            problems.push(
                `files: "${entry.name}" is published, but should never be. Remove it from "files" in package.json.`
            );
        } else if (!published.has(entry.name) && !notPublished.has(entry.name)) {
            problems.push(
                `files: "${entry.name}" is not published. Add it to "files" in package.json, or if it should never be published, to the paths not published (--not-published).`
            );
        }
    }
    return problems.toSorted((a, b) => a.localeCompare(b, 'en'));
};
