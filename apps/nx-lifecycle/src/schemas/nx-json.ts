import type { ErrorObject } from 'ajv';
import { identifier } from 'haystack-di';
import { objectSchema, type SchemaType } from 'juniper';
import { ajv } from './lib/ajv.js';
import { allTargetsSchema } from './target.js';

const nxJsonSchema = objectSchema({
    properties: {
        targetDefaults: allTargetsSchema,
    },
    additionalProperties: true,
});

export type NxJson = SchemaType<typeof nxJsonSchema>;

export interface IsNxJson {
    (val: unknown): val is NxJson;
    errors?: null | ErrorObject[];
}
export const isNxJson: IsNxJson = ajv.compile<NxJson>(nxJsonSchema.toJSON());
export const isNxJsonIdentifier = identifier<IsNxJson>().named('nxJson');
