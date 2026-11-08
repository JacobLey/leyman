import type * as PrettierNamespace from 'prettier';
import Path from 'node:path';
import { fileURLToPath } from 'node:url';
import { identifier } from 'haywire';

/**
 * Prettier's module, as `import('prettier')` returns it.
 */
export type PrettierModule = typeof PrettierNamespace;
/**
 * Imports Prettier. Kept a function so that finding Prettier installed doesn't import it.
 */
export type PrettierImport = () => Promise<PrettierModule>;

/**
 * Path to the biome executable. Throws if biome is not installed.
 */
export const biomePathId = identifier<string>().named('biomePath');
/**
 * Import of Prettier. Throws if prettier is not installed.
 */
export const prettierImportId = identifier<PrettierImport>().named('prettierImport');

export const biomePath = (): string => {
    const fullPath = import.meta.resolve('@biomejs/biome/scripts/postinstall.js');
    return Path.join(fileURLToPath(fullPath), '../../bin/biome');
};

const importPrettier: PrettierImport = async () => import('prettier');

export const prettierImport = (): PrettierImport => {
    // Throws if Prettier is not installed, without importing it
    import.meta.resolve('prettier');
    return importPrettier;
};
