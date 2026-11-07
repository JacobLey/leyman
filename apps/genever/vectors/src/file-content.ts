/* eslint-disable import-x/no-extraneous-dependencies -- The whole file is only loaded by the populate-files target */
import type { Schema } from 'juniper';
import type { PopulateFileParams } from 'load-populate-files';
import * as fc from 'fast-check';
import { makeArbitrary } from 'juniper-arbitrary';
import { invalidSchemas, strictSchemas, unsupportedSchemas } from './error-schemas.js';
import * as juniperSchemas from './juniper-schemas.js';

// Accepts nothing, so has no samples
const withoutSamples = new Set(['never']);
// Enough values to reach each branch of a fixture, from a fixed seed so the files only change with the fixtures
const sampleCount = 25;
const seed = 42;

export default [
    ...Object.entries(juniperSchemas).map(([name, juniperSchema]) => {
        const schema = juniperSchema as Schema<unknown>;
        return {
            filePath: `./fixtures/${name}.json`,
            content: {
                schema: schema.toJSON(),
                samples: withoutSamples.has(name)
                    ? []
                    : fc.sample(makeArbitrary(schema), { numRuns: sampleCount, seed }),
            },
        };
    }),
    {
        filePath: './errors.json',
        content: {
            invalid: invalidSchemas,
            strict: strictSchemas,
            unsupported: unsupportedSchemas,
        },
    },
] satisfies readonly PopulateFileParams[];
