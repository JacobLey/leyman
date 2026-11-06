import { expect } from '@leyman/expect';
import {
    executorJsonSchema,
    optionsJsonSchema,
    packageGeneratorJsonSchema,
} from '@leyman/nx-plugin';
import { suite, test } from 'mocha-chain';
import fileContent from '#internal/file-content.js';

suite('file-content', () => {
    test('Writes the options, executor and generator schemas', () => {
        expect(fileContent).to.deep.equal([
            { filePath: './schema.json', content: optionsJsonSchema },
            { filePath: './executors/targets/schema.json', content: executorJsonSchema },
            { filePath: './generators/package/schema.json', content: packageGeneratorJsonSchema },
        ]);
    });
});
