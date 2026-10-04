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
        filePath: './test/data/does-not-exist.json',
        content: 'Will never get written',
    },
] satisfies PopulateFileParams[];
