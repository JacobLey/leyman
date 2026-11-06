import type { DirectoryResult } from 'tmp-promise';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { dir } from 'tmp-promise';

/**
 * This package's own `tsc`, for packages in temporary directories, which have none installed.
 * Tests run from `dist-test/integration/`.
 */
export const tsc = Path.join(import.meta.dirname, '../../../node_modules/.bin/tsc');

/**
 * The files of a small ESM package with types that passes every check, under the `esm-only` profile.
 *
 * @param overrides - fields of `package.json` to set, or to remove with `undefined`
 * @returns file contents by path from the workspace root
 */
export const goodPackage = (overrides: Record<string, unknown> = {}): Record<string, string> => ({
    'pkg/package.json': JSON.stringify({
        name: 'good-package',
        version: '1.0.0',
        type: 'module',
        engines: { node: '>=22' },
        license: 'MIT',
        exports: { '.': './dist/index.js' },
        types: './dist/index.d.ts',
        files: ['dist'],
        ...overrides,
    }),
    'pkg/dist/index.js': 'export const answer = 42;\n',
    'pkg/dist/index.d.ts': 'export declare const answer: number;\n',
});

export interface WorkspaceContext {
    tmpDir: DirectoryResult;
    /**
     * The package directory, `pkg/` under the workspace root.
     */
    cwd: string;
    resolve: (path: string) => string;
    writeFiles: (files: Record<string, string>) => Promise<void>;
    /**
     * Writes an executable script.
     */
    writeScript: (path: string, content: string) => Promise<string>;
}

/**
 * Creates a workspace in a temporary directory, its root marked by an empty `pnpm-lock.yaml`.
 * Intended for a `beforeEach` hook, paired with `tmpDir.cleanup()` in `afterEach`.
 *
 * @returns test context
 */
export const createWorkspace = async (): Promise<WorkspaceContext> => {
    const tmpDir = await dir({ prefix: 'check-package-test-', unsafeCleanup: true });
    const resolve = (path: string): string => Path.join(tmpDir.path, path);
    const writeFiles = async (files: Record<string, string>): Promise<void> => {
        await Promise.all(
            Object.entries(files).map(async ([path, content]) => {
                await mkdir(Path.dirname(resolve(path)), { recursive: true });
                await writeFile(resolve(path), content);
            })
        );
    };
    await writeFiles({ 'pnpm-lock.yaml': '' });
    return {
        tmpDir,
        resolve,
        writeFiles,
        cwd: resolve('pkg'),
        writeScript: async (path, content) => {
            await writeFiles({ [path]: content });
            await chmod(resolve(path), 0o755);
            return resolve(path);
        },
    };
};
