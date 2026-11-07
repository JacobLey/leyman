import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { jsonSchema, openApiDocument } from '#internal/documents.js';
import fileContent from '#internal/file-content.js';

suite('file-content', () => {
    test('Writes the documents every tool gets, for the Go comparison', () => {
        expect(fileContent).to.deep.equal([
            { filePath: './json-schema.json', content: jsonSchema },
            { filePath: './openapi.json', content: openApiDocument },
        ]);
    });
});
