import Path from 'node:path';
import { fileURLToPath } from 'node:url';
import { identifier } from 'haywire';

/**
 * Path to the biome executable. Throws if biome is not installed.
 */
export const biomePathId = identifier<string>().named('biomePath');
/**
 * Path to the prettier executable. Throws if prettier is not installed.
 */
export const prettierPathId = identifier<string>().named('prettierPath');

export const biomePath = (): string => {
    const fullPath = import.meta.resolve('@biomejs/biome/scripts/postinstall.js');
    return Path.join(fileURLToPath(fullPath), '../../bin/biome');
};

export const prettierPath = (): string => {
    const fullPath = import.meta.resolve('prettier');
    return Path.join(fileURLToPath(fullPath), '../bin/prettier.cjs');
};
