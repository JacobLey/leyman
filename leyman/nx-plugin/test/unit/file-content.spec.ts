import { expect } from '@leyman/expect';
import { executorJsonSchema, optionsJsonSchema } from '@leyman/nx-plugin';
import { suite, test } from 'mocha-chain';
import fileContent from '#internal/file-content.js';

suite('file-content', () => {
    test('Writes the options and executor schemas', () => {
        expect(fileContent).to.deep.equal([
            { filePath: './schema.json', content: optionsJsonSchema },
            { filePath: './executors/targets/schema.json', content: executorJsonSchema },
        ]);
    });
});
