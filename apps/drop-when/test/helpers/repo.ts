import type { DirectoryResult } from 'tmp-promise';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { promisify } from 'node:util';
import { dir } from 'tmp-promise';

const execFileAsync = promisify(execFile);

export interface RepoContext {
    readonly repo: DirectoryResult;
    /**
     * Writes files, relative to the repository, creating their directories.
     */
    readonly write: (files: Readonly<Record<string, string | Uint8Array>>) => Promise<void>;
    /**
     * Runs Git in the repository.
     */
    readonly git: (...args: readonly string[]) => Promise<void>;
}

/**
 * Creates an empty Git repository in a temporary directory. For a `beforeEach`, paired with `repo.cleanup()`.
 *
 * @param [options] - what to create
 * @param [options.git] - `false` for a plain directory, outside any Git work tree
 * @returns the repository and helpers
 */
export const createRepo = async ({ git = true } = {}): Promise<RepoContext> => {
    const repo = await dir({ prefix: 'drop-when-', unsafeCleanup: true });
    const runGit = async (...args: readonly string[]): Promise<void> => {
        await execFileAsync('git', args, { cwd: repo.path });
    };
    if (git) {
        await runGit('init', '--quiet');
    }

    return {
        repo,
        write: async files => {
            await Promise.all(
                Object.entries(files).map(async ([path, content]) => {
                    const fullPath = Path.join(repo.path, path);
                    await mkdir(Path.dirname(fullPath), { recursive: true });
                    await writeFile(fullPath, content);
                })
            );
        },
        git: runGit,
    };
};
