import type { DirectoryResult } from 'tmp-promise';
import { execFile } from 'node:child_process';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { promisify } from 'node:util';
import { dir } from 'tmp-promise';

const execFileAsync = promisify(execFile);

// TypeScript 7.1's compiler, the package's own devDependency
const tsc = Path.resolve('node_modules/.bin/tsc');

export interface Project {
    tmpDir: DirectoryResult;
    /**
     * Write files into the project, with a `tsconfig.json` that maps `.schema.yaml` and `.openapi.yaml` files.
     */
    write: (files: Readonly<Record<string, string>>, mapperOptions?: unknown) => Promise<void>;
    /**
     * Type check the project.
     */
    check: (flags?: readonly string[]) => Promise<{ code: number; output: string }>;
}

/**
 * A project in a temporary directory, which resolves `genever-content-mapper` to this package.
 *
 * @returns test context
 */
export const createProject = async (): Promise<{ project: Project }> => {
    const tmpDir = await dir({ prefix: 'genever-content-mapper-', unsafeCleanup: true });
    await mkdir(Path.join(tmpDir.path, 'node_modules'));
    await symlink(
        process.cwd(),
        Path.join(tmpDir.path, 'node_modules', 'genever-content-mapper'),
        'dir'
    );
    return {
        project: {
            tmpDir,
            write: async (files, mapperOptions) => {
                const tsconfig = {
                    compilerOptions: {
                        strict: true,
                        noEmit: true,
                        module: 'nodenext',
                        target: 'esnext',
                    },
                    contentMappers: [
                        {
                            package: 'genever-content-mapper',
                            extensions: ['.schema.yaml', '.openapi.yaml'],
                            ...(mapperOptions !== undefined && { options: mapperOptions }),
                        },
                    ],
                    include: ['*.ts'],
                };
                await Promise.all(
                    Object.entries({
                        'package.json': '{ "type": "module" }',
                        'tsconfig.json': JSON.stringify(tsconfig, null, 2),
                        ...files,
                    }).map(async ([name, content]) =>
                        writeFile(Path.join(tmpDir.path, name), content)
                    )
                );
            },
            check: async (flags = ['--runExternalCode']) => {
                try {
                    await execFileAsync(tsc, ['-p', tmpDir.path, '--pretty', 'false', ...flags], {
                        cwd: tmpDir.path,
                    });
                    return { code: 0, output: '' };
                } catch (error) {
                    const { code, stdout } = error as { code: number; stdout: string };
                    return { code, output: stdout };
                }
            },
        },
    };
};
