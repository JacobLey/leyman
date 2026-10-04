import { readFile } from 'node:fs/promises';
import Path from 'node:path';
import { populateFile } from 'populate-files';
import { findFilesForIndex, findIndexFiles } from './glob.js';

/**
 * Generate the content of a barrel file.
 *
 * @param param - params
 * @param param.files - sibling files to re-export
 * @param param.types - files (by output name) that should only re-export types
 * @returns barrel file content
 */
export const generateBarrelFile = ({
    files,
    types,
}: {
    files: string[];
    types: Set<string>;
}): string =>
    [
        // Idempotent
        '// AUTO-BARREL',
        '',
        ...files
            .map(file => {
                const ext = Path.extname(file);
                const base = Path.basename(file, ext);

                return `${base}${ext.replace('t', 'j')}`;
            })
            .toSorted((a, b) => a.localeCompare(b, 'en'))
            .map(filename => `export ${types.has(filename) ? 'type ' : ''}* from './${filename}';`),
        '',
    ].join('\n');

/**
 * Parse files that are explicitly re-exported as types only.
 *
 * Returns every TS/JS extension variant of each file name.
 *
 * @param file - existing barrel file content
 * @returns set of type-only file names
 */
export const parseTypes = (file: string): Set<string> => {
    const matches = file.matchAll(
        /^export type \* from '\.\/(?<filename>.+)\.(?<extension>[cm]?[tj]s)';$/gmu
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

/**
 * Barrel a single file.
 * Returns true if file was out-of-sync.
 *
 * @param param - params
 * @param param.dryRun - if true, do not actually write file
 * @param param.filePath - fully resolved path to file
 * @returns true if updated
 */
const barrelFile = async ({
    dryRun,
    filePath,
}: {
    dryRun: boolean;
    filePath: string;
}): Promise<boolean> => {
    const data = await readFile(filePath, 'utf8');

    if (!data.startsWith('// AUTO-BARREL')) {
        return false;
    }

    const files = await findFilesForIndex(filePath);

    const { updated } = await populateFile(
        {
            filePath,
            content: generateBarrelFile({ files, types: parseTypes(data) }),
        },
        {
            dryRun,
            check: false,
        }
    );
    return updated;
};

/**
 * Update all barrel files in current working directory.
 *
 * Optionally ignore some files, and skip writes ("dry run").
 *
 * Returns list of all files that got updated.
 *
 * @param param - params
 * @param param.cwd - directory to search/update index files
 * @param param.dryRun - if true, skip writes
 * @param param.ignore - list of files/blobs to ignore when searching for index files
 * @returns list of all files that got updated
 */
export const barrelFiles = async ({
    cwd,
    dryRun,
    ignore,
}: {
    cwd: string;
    dryRun: boolean;
    ignore: string[];
}): Promise<string[]> => {
    const indexFiles = await findIndexFiles({ dir: cwd, ignore });

    const updated = await Promise.all(
        indexFiles.map(async file => {
            const filePath = Path.resolve(cwd, file);
            return (await barrelFile({ dryRun, filePath })) ? filePath : null;
        })
    );

    return updated.filter(filePath => filePath !== null);
};
