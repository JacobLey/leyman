import type { DirectoryResult } from 'tmp-promise';
import { mkdir, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { dir } from 'tmp-promise';

export interface DirectoryContext {
    readonly directory: DirectoryResult;
    /**
     * Writes files, relative to the directory, creating their directories.
     */
    readonly write: (files: Readonly<Record<string, string | Uint8Array>>) => Promise<void>;
}

/**
 * Creates an empty temporary directory to scan. For a `beforeEach`, paired with `directory.cleanup()`.
 *
 * @returns the directory, and a helper to write files in it
 */
export const createDirectory = async (): Promise<DirectoryContext> => {
    const directory = await dir({ prefix: 'drop-when-', unsafeCleanup: true });
    return {
        directory,
        write: async files => {
            await Promise.all(
                Object.entries(files).map(async ([path, content]) => {
                    const fullPath = Path.join(directory.path, path);
                    await mkdir(Path.dirname(fullPath), { recursive: true });
                    await writeFile(fullPath, content);
                })
            );
        },
    };
};
