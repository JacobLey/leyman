/* eslint-disable import-x/no-extraneous-dependencies -- The whole file is only loaded by the populate-files target */
import type { PopulateFileParams } from 'load-populate-files';
import { jsonSchema, largeJsonSchema, largeOpenApiDocument, openApiDocument } from './documents.js';

/**
 * The documents every tool gets, as JSON for the comparison of Go generators (`e2e/genever-go-comparison`), which
 * reads them by path. With the large documents at two definitions, which that comparison's tests check its own
 * builders against.
 */
export default [
    { filePath: './json-schema.json', content: jsonSchema },
    { filePath: './openapi.json', content: openApiDocument },
    { filePath: './large-json-schema.json', content: largeJsonSchema(2) },
    { filePath: './large-openapi.json', content: largeOpenApiDocument(2) },
] satisfies readonly PopulateFileParams[];
