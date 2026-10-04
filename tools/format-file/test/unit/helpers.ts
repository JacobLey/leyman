import type { DirectoryResult } from 'tmp-promise';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { dir } from 'tmp-promise';
import { bind, createContainer, createModule } from 'haywire';
import {
    Biome,
    biomePath,
    biomePathId,
    Formatter,
    formatterModule,
    Prettier,
    prettierPath,
    prettierPathId,
} from '#lib';

export const unformatted = {
    js: 'function f() {\nreturn 1;\n}\n',
    md: '# Title\n\n*  item\n',
    invalid: 'const x = {\n',
};

export const formatted = {
    biome: 'function f() {\n\treturn 1;\n}\n',
    prettier: 'function f() {\n  return 1;\n}\n',
    md: '# Title\n\n- item\n',
};

const notInstalled = (): string => {
    throw new Error('Not installed');
};

/**
 * Build formatters with real tools, optionally simulating that some are not installed.
 *
 * @param [installed] - which formatters are installed (default both)
 * @param [installed.biome] - biome is installed
 * @param [installed.prettier] - prettier is installed
 * @returns formatter instances sharing a container
 */
export const createFormatters = ({
    biome = true,
    prettier = true,
}: {
    biome?: boolean;
    prettier?: boolean;
} = {}): { biome: Biome; prettier: Prettier; formatter: Formatter } => {
    const container = createContainer(
        formatterModule.mergeModule(
            createModule(
                bind(biomePathId).withFactory(biome ? biomePath : notInstalled)
            ).addBinding(bind(prettierPathId).withFactory(prettier ? prettierPath : notInstalled))
        )
    );
    return {
        biome: container.get(Biome),
        prettier: container.get(Prettier),
        formatter: container.get(Formatter),
    };
};

export interface TmpCwd {
    tmpDir: DirectoryResult;
    resolve: (path: string) => string;
    write: (path: string, content: string) => Promise<void>;
    read: (path: string) => Promise<string>;
    restore: () => Promise<void>;
}

/**
 * Create a temporary directory and make it the current working directory,
 * which is where formatter configuration is looked up from.
 * Intended for use as a `beforeEach` hook, paired with `restore()` in `afterEach`.
 *
 * @returns test context
 */
export const createTmpCwd = async (): Promise<TmpCwd> => {
    const originalCwd = process.cwd();
    const tmpDir = await dir({ prefix: 'format-file-', unsafeCleanup: true });
    process.chdir(tmpDir.path);

    const resolve = (path: string): string => Path.join(tmpDir.path, path);

    return {
        tmpDir,
        resolve,
        write: async (path, content) => {
            await mkdir(Path.dirname(resolve(path)), { recursive: true });
            await writeFile(resolve(path), content);
        },
        read: async path => readFile(resolve(path), 'utf8'),
        restore: async () => {
            process.chdir(originalCwd);
            await tmpDir.cleanup();
        },
    };
};
