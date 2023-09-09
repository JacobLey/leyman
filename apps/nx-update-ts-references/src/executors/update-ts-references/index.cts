const indexProm = import('./index.js');

export default async (...args: Parameters<Awaited<typeof indexProm>['default']>) => {
    const index = await indexProm;
    return index.default(...args);
};
