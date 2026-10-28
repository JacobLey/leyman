import type { DirectoryResult } from 'tmp-promise';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { dir } from 'tmp-promise';

export interface Fixture {
    readonly tmpDir: DirectoryResult;
    /**
     * Absolute path of a file in the fixture.
     */
    readonly path: (...segments: string[]) => string;
    /**
     * Write files, as text or JSON, creating their directories.
     */
    readonly write: (files: Readonly<Record<string, object | string>>) => Promise<void>;
    /**
     * Create a symbolic link to a directory.
     */
    readonly link: (target: string, path: string) => Promise<void>;
}

/**
 * A directory of files for a test.
 *
 * @returns test context
 */
export const createFixture = async (): Promise<{ fixture: Fixture }> => {
    const tmpDir = await dir({ prefix: 'trusted-tsc-', unsafeCleanup: true });
    const path = (...segments: string[]): string => Path.join(tmpDir.path, ...segments);
    return {
        fixture: {
            tmpDir,
            path,
            write: async files => {
                for (const [name, content] of Object.entries(files)) {
                    await mkdir(Path.dirname(path(name)), { recursive: true });
                    await writeFile(
                        path(name),
                        typeof content === 'string' ? content : JSON.stringify(content, null, 2)
                    );
                }
            },
            link: async (target, name) => {
                await mkdir(Path.dirname(path(name)), { recursive: true });
                await symlink(Path.resolve(tmpDir.path, target), path(name), 'dir');
            },
        },
    };
};
