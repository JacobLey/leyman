import Path from 'node:path';
import { fileURLToPath } from 'node:url';

export const biomePath = (): string => {
    const fullPath = import.meta.resolve('@biomejs/biome/scripts/postinstall.js');
    return Path.join(fileURLToPath(fullPath), '../../bin/biome');
};

export const prettierPath = (): string => {
    const fullPath = import.meta.resolve('prettier');
    return Path.join(fileURLToPath(fullPath), '../bin/prettier.cjs');
};
