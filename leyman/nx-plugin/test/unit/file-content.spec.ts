import { expect } from '@leyman/expect';
import {
    executorJsonSchema,
    initGeneratorJsonSchema,
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
            { filePath: './generators/init/schema.json', content: initGeneratorJsonSchema },
            { filePath: './generators/package/schema.json', content: packageGeneratorJsonSchema },
        ]);
    });
});
