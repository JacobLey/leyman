import type { IsGitignored } from './gitignore.js';
import { readFile } from 'node:fs/promises';
import Path from 'node:path';
import { populateFile } from 'populate-files';
import { loadGitignore } from './gitignore.js';
import { findFilesForIndex, findIndexFiles } from './glob.js';

const MARKER = '// AUTO-BARREL';
const SUBDIRECTORIES_MARKER = `${MARKER} subdirectories`;

/**
 * Generate the content of a barrel file.
 *
 * @param param - params
 * @param param.files - files to re-export, relative to the barrel: siblings, and `<dir>/index.*`
 * @param param.types - files (by output name) that should only re-export types
 * @param [param.subdirectories] - the barrel also re-exports subdirectories, kept in its marker
 * @returns barrel file content
 */
export const generateBarrelFile = ({
    files,
    types,
    subdirectories = false,
}: {
    files: string[];
    types: Set<string>;
    subdirectories?: boolean;
}): string =>
    [
        // Idempotent
        subdirectories ? SUBDIRECTORIES_MARKER : MARKER,
        '',
        ...[
            ...new Set(
                files.map(file => {
                    const ext = Path.extname(file);
                    const base = file.slice(0, -ext.length);

                    // `.tsx` compiles to `.js`, like `.ts`
                    return `${base}${ext === '.tsx' ? '.js' : ext.replace('t', 'j')}`;
                })
            ),
        ]
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
        // eslint-disable-next-line sonarjs/unused-named-groups -- Read from each match's `groups` below, which the rule doesn't follow through `matchAll`
        /^export type \* from '\.\/(?<filename>.+)\.(?<extension>[cm]?[jt]s)';$/gmv
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
 * @param param.isGitignored - gitignore rules covering the file
 * @returns true if updated
 */
const didUpdateBarrelFile = async ({
    dryRun,
    filePath,
    isGitignored,
}: {
    dryRun: boolean;
    filePath: string;
    isGitignored: IsGitignored;
}): Promise<boolean> => {
    const data = await readFile(filePath, 'utf8');

    if (!data.startsWith(MARKER)) {
        return false;
    }
    const [marker] = data.split(/\r?\n/v, 1);
    const isSubdirectories = marker === SUBDIRECTORIES_MARKER;

    const files = await findFilesForIndex(filePath, isGitignored, {
        subdirectories: isSubdirectories,
    });

    const { updated } = await populateFile(
        {
            filePath,
            content: generateBarrelFile({
                files,
                types: parseTypes(data),
                subdirectories: isSubdirectories,
            }),
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
    ignore: readonly string[];
}): Promise<string[]> => {
    // Loaded once: every index file is inside `cwd`, so the same rules cover all of them
    const isGitignored = await loadGitignore(cwd);
    const indexFiles = await findIndexFiles({ dir: cwd, ignore, isGitignored });

    const updated = await Promise.all(
        indexFiles.map(async file => {
            const filePath = Path.resolve(cwd, file);
            return (await didUpdateBarrelFile({ dryRun, filePath, isGitignored }))
                ? filePath
                : null;
        })
    );

    return updated.filter(filePath => filePath !== null);
};
