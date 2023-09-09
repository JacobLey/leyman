// @ts-expect-error
import type { default as foo } from './index.js';

const indexProm = import('./index.js');

export default async (...args: Parameters<typeof foo>) => {
    const index = await indexProm;
    return index.default(...args);
};
