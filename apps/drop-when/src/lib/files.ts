import { execFile } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import Path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Room for the list of a large repository's files (256MiB), far above the default 1MiB.
 */
// eslint-disable-next-line @typescript-eslint/no-magic-numbers -- Named by the constant
const maxBuffer = 2 ** 28;

/**
 * Lists the files Git tracks, or would track (untracked files that no ignore rule matches), so a new file is checked
 * before it is added, and nothing ignored (`node_modules`, build output) ever is.
 *
 * @param cwd - where Git runs, and what the paths are relative to
 * @param paths - Git pathspecs to list under (`':!docs'` excludes), or the whole of `cwd` when empty
 * @returns paths relative to `cwd`, sorted, or Git's error when it fails (such as outside a Git work tree)
 */
export const listFiles = async (
    cwd: string,
    paths: readonly string[]
): Promise<{ readonly error: string } | { readonly files: string[] }> => {
    let stdout: string;
    try {
        ({ stdout } = await execFileAsync(
            'git',
            ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...paths],
            { cwd, maxBuffer }
        ));
    } catch (error) {
        // Its message names the command and holds Git's own error
        return {
            error: `Could not list files with Git: ${(error as Error).message.trim()}`,
        };
    }

    // A file with merge conflicts is listed once per stage
    return {
        files: [...new Set(stdout.split('\0').filter(path => path !== ''))].toSorted(
            (a, b) => Number(a > b) - Number(a < b)
        ),
    };
};

/**
 * Reads a listed file as text.
 *
 * Skips what has no text of its own: a symbolic link (its target is listed itself, when tracked), a submodule, a file
 * deleted from the work tree but not yet from the index, and a binary file (with a NUL byte, as Git decides).
 *
 * @param cwd - what `path` is relative to
 * @param path - a path `listFiles()` returned
 * @returns its text, or `null` when skipped
 */
export const readText = async (cwd: string, path: string): Promise<string | null> => {
    const fullPath = Path.join(cwd, path);
    // eslint-disable-next-line n/no-sync -- Only the sync call tells a missing file from a failure without throwing
    if (lstatSync(fullPath, { throwIfNoEntry: false })?.isFile() !== true) {
        return null;
    }
    const content = await readFile(fullPath);
    return content.includes(0) ? null : content.toString('utf8');
};
