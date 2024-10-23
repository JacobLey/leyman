import { readFile, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { globby } from 'globby';
import { findImport } from 'find-import';
import { patch } from 'named-patch';

const parseTypeOnly = (data: string): Set<string> => {
    const matches = data.matchAll(
        /^export type \* from '(?<filename>.+)\.(?<extension>[cm]?[tj]s)';$/gmu
    );

    const result = new Set<string>();

    for (const match of matches) {
        const { filename, extension } = match.groups!;

        result.add(`${filename!}.${extension!}`);
        result.add(`${filename!}.${extension!.replace('j', 't')}`);
        result.add(`${filename!}.${extension!.replace('t', 'j')}`);
    }

    return result;
};

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

export const generateBarrelFile = (files: string[], data: string): string => {
    const typeOnlys = parseTypeOnly(data);

    return [
        // Idempotent
        '// AUTO-BARREL',
        '',
        ...files
            .map(file => {
                const ext = Path.extname(file);
                const base = Path.basename(file, ext);

                return `./${base}${ext.replace('t', 'j')}`;
            })
            .sort()
            .map(
                filename => `export ${typeOnlys.has(filename) ? 'type ' : ''}* from '${filename}';`
            ),
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

                const extensions = await getExtensions(filePath);
                const files = await globby([`*.${extensions}`, '!index.?(c|m)ts'], {
                    cwd: Path.dirname(filePath),
                    gitignore: true,
                });

                const barrel = generateBarrelFile(files, data);

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
