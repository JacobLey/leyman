/* eslint-disable import-x/no-extraneous-dependencies -- The whole file is only loaded by the populate-files target */
import type { Schema } from 'juniper';
import type { PopulateFileParams } from 'load-populate-files';
import * as fc from 'fast-check';
import { components } from 'juniper';
import { makeArbitrary } from 'juniper-arbitrary';
import { invalidSchemas, strictSchemas, unsupportedSchemas } from './error-schemas.js';
import * as juniperSchemas from './juniper-schemas.js';
import * as openApiSchemas from './openapi-schemas.js';

// Accepts nothing, so has no samples
const withoutSamples = new Set(['never']);
// Enough values to reach each branch of a fixture, from a fixed seed so the files only change with the fixtures
const sampleCount = 25;
const seed = 42;

/**
 * Values a schema accepts.
 *
 * @param schema - Juniper schema
 * @returns samples, the same for the same schema
 */
const samplesOf = (schema: Schema<unknown>): unknown[] =>
    fc.sample(makeArbitrary(schema), { numRuns: sampleCount, seed });

// Each OpenAPI version, and how Juniper writes its schemas' components
const openApiVersions = [
    { openapi: '3.0.3', options: { openApi30: true } },
    { openapi: '3.1.0', options: { definitionsPath: '#/components/schemas/' } },
] as const;

export default [
    ...Object.entries(juniperSchemas).map(([name, juniperSchema]) => {
        const schema = juniperSchema as Schema<unknown>;
        return {
            filePath: `./fixtures/${name}.json`,
            content: {
                schema: schema.toJSON(),
                samples: withoutSamples.has(name) ? [] : samplesOf(schema),
            },
        };
    }),
    ...openApiVersions.map(({ openapi, options }) => ({
        filePath: `./openapi/${openapi}.json`,
        content: {
            document: {
                openapi,
                info: { title: 'API', version: '1.0.0' },
                paths: {},
                components: {
                    schemas: components([openApiSchemas.user, openApiSchemas.tree], options),
                },
            },
            samples: {
                Address: samplesOf(openApiSchemas.address),
                User: samplesOf(openApiSchemas.user),
                TreeNode: samplesOf(openApiSchemas.tree),
            },
        },
    })),
    {
        filePath: './errors.json',
        content: {
            invalid: invalidSchemas,
            strict: strictSchemas,
            unsupported: unsupportedSchemas,
        },
    },
] satisfies readonly PopulateFileParams[];
