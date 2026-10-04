import type { DirectoryResult } from 'tmp-promise';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { dir } from 'tmp-promise';

export const HEADER = '// AUTO-BARREL';

/**
 * Build the expected content of a barrel file.
 *
 * @param exports - export lines, in order
 * @returns barrel file content
 */
export const barrel = (...exports: string[]): string => [HEADER, '', ...exports, ''].join('\n');

export interface TmpDirContext {
    tmpDir: DirectoryResult;
    resolve: (path: string) => string;
    writeFiles: (files: Record<string, string>) => Promise<void>;
    read: (path: string) => Promise<string>;
}

/**
 * Create a temporary directory, with helpers to populate and read files.
 * Intended for use as a `beforeEach` hook, paired with `tmpDir.cleanup()` in `afterEach`.
 *
 * @returns test context
 */
export const createTmpDir = async (): Promise<TmpDirContext> => {
    const tmpDir = await dir({ prefix: 'barrelify-', unsafeCleanup: true });

    const resolve = (path: string): string => Path.join(tmpDir.path, path);

    return {
        tmpDir,
        resolve,
        writeFiles: async files => {
            await Promise.all(
                Object.entries(files).map(async ([path, content]) => {
                    await mkdir(Path.dirname(resolve(path)), { recursive: true });
                    await writeFile(resolve(path), content);
                })
            );
        },
        read: async path => readFile(resolve(path), 'utf8'),
    };
};
