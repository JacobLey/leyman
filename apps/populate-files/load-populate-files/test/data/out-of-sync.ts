import type { PopulateFileParams } from 'load-populate-files';

export default [
    {
        filePath: './test/data/in-sync.json',
        content: Promise.resolve({
            foo: 1,
            bar: true,
        }),
    },
    {
        filePath: './test/data/out-of-sync.txt',
        content: new Uint8Array([1, 2, 3, 4]),
    },
] satisfies PopulateFileParams[];
