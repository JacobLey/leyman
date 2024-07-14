import Path from 'node:path';
import { fileURLToPath } from 'node:url';

export const biomePath = (): string => {
    const fullPath = import.meta.resolve('@biomejs/biome/scripts/postinstall.js');
    return Path.join(fileURLToPath(fullPath), '../../bin/biome');
};
