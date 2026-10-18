import type { DirectoryResult } from 'tmp-promise';
import { readFile, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { dir } from 'tmp-promise';

export const userSchema = {
    type: 'object',
    properties: { name: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } },
    required: ['name'],
};

export interface TmpDirContext {
    tmpDir: DirectoryResult;
    resolve: (path: string) => string;
    writeJson: (path: string, content: unknown) => Promise<void>;
    read: (path: string) => Promise<string>;
}

/**
 * Create a temporary directory, with helpers to write schemas and read generated files.
 * Intended for use as a `beforeEach` hook, paired with `tmpDir.cleanup()` in `afterEach`.
 *
 * @returns test context
 */
export const createTmpDir = async (): Promise<TmpDirContext> => {
    const tmpDir = await dir({ prefix: 'genever-', unsafeCleanup: true });

    const resolve = (path: string): string => Path.join(tmpDir.path, path);

    return {
        tmpDir,
        resolve,
        writeJson: async (path, content) => {
            await writeFile(resolve(path), JSON.stringify(content));
        },
        read: async path => readFile(resolve(path), 'utf8'),
    };
};
