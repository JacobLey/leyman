const indexProm = import('./index.js');

/**
 * CommonJS version of handler for Nx.
 *
 * @param args - see options
 * @returns promise of completions
 */
export default async (
    ...args: Parameters<Awaited<typeof indexProm>['default']>
): ReturnType<Awaited<typeof indexProm>['default']> => {
    const index = await indexProm;
    return index.default(...args);
};
