import type { ErrorObject } from 'ajv';
import type { SchemaType } from 'juniper';
import { identifier } from 'haywire';
import { objectSchema } from 'juniper';
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
    errors?: ErrorObject[] | null;
}
export const isNxJson: IsNxJson = ajv.compile<NxJson>(nxJsonSchema.toJSON());
export const isNxJsonIdentifier = identifier<IsNxJson>().named('nxJson');
