import type { SchemaType } from 'juniper';
import { identifier } from 'haywire';
import { objectSchema } from 'juniper';
import { makeValidator } from 'juniper-validator';
import { allTargetsSchema } from './target.js';

const projectJsonSchema = objectSchema({
    properties: {
        targets: allTargetsSchema,
    },
    additionalProperties: true,
});
export type ProjectJson = SchemaType<typeof projectJsonSchema>;

export const assertProjectJson = makeValidator(projectJsonSchema).assert;
export type AssertProjectJson = typeof assertProjectJson;
export const assertProjectJsonIdentifier = identifier<AssertProjectJson>().named('projectJson');
