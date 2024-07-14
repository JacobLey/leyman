import { readFile, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { globby } from 'globby';
import { findImport } from 'find-import';
import { patch } from 'named-patch';

const getExtensions = async (path: string): Promise<string> => {
    const pkg = await findImport('package.json', {
        cwd: path,
    });

    const isModule = (pkg?.content as { type?: string }).type === 'module';
    const fileIsModule = path.endsWith('.mts') || (path.endsWith('.ts') && isModule);

    if (fileIsModule) {
        return '?(c|m)ts';
    }
    if (isModule) {
        return 'cts';
    }
    return '?(c)ts';
};

const generateBarrelFile = async (path: string): Promise<string> => {
    const extensions = await getExtensions(path);
    const files = await globby([`*.${extensions}`, '!index.?(c|m)ts'], {
        cwd: Path.dirname(path),
        gitignore: true,
    });

    return [
        // Idempotent
        '// AUTO-BARREL',
        '',
        ...files.map(file => {
            const ext = Path.extname(file);
            const base = Path.basename(file, ext);

            return `export * from './${base}${ext.replace('t', 'j')}';`;
        }),
        '',
    ].join('\n');
};

export const barrelFiles = patch(
    async ({
        cwd,
        dryRun,
        ignore = [],
        logger = { info: () => {} },
    }: {
        cwd: string;
        dryRun: boolean;
        ignore?: string[] | undefined;
        logger?: { info: (...args: unknown[]) => void };
    }): Promise<string[]> => {
        const indexFiles = await globby(
            [
                '**/index.?(c|m)ts',
                '!**/node_modules/**',
                ...ignore.map(i => `!${i.replaceAll('\\', '/')}`),
            ],
            {
                cwd,
                gitignore: true,
            }
        );

        const mismatchFiles: string[] = [];

        await Promise.all(
            indexFiles.map(async file => {
                const filePath = Path.resolve(cwd, file);

                const data = await readFile(filePath, 'utf8');

                if (!data.startsWith('// AUTO-BARREL')) {
                    return;
                }

                const barrel = await generateBarrelFile(filePath);

                if (barrel !== data) {
                    mismatchFiles.push(filePath);
                    logger.info(filePath);
                    if (dryRun) {
                        return;
                    }
                    await patch(writeFile)(filePath, barrel, 'utf8');
                }
            })
        );

        return mismatchFiles;
    }
);
