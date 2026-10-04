import type { PopulateFileParams } from 'load-populate-files';

export default {
    // File is loaded from /dist-test
    filePath: '../test/data/in-sync.json',
    content: Promise.resolve({
        foo: 1,
        bar: true,
    }),
} satisfies PopulateFileParams;
