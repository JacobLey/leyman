import type { SchemaType } from 'juniper';
import { identifier } from 'haywire';
import { objectSchema } from 'juniper';
import { makeValidator } from 'juniper-validator';
import { allTargetsSchema } from './target.js';

const nxJsonSchema = objectSchema({
    properties: {
        targetDefaults: allTargetsSchema,
    },
    additionalProperties: true,
});
export type NxJson = SchemaType<typeof nxJsonSchema>;

export const assertNxJson = makeValidator(nxJsonSchema).assert;
export type AssertNxJson = typeof assertNxJson;
export const assertNxJsonIdentifier = identifier<AssertNxJson>().named('nxJson');
