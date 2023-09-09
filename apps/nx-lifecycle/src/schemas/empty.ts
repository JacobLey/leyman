import { objectSchema, type SchemaType } from 'juniper';
import { ajv } from './lib/ajv.js';

const emptySchema = objectSchema({
    additionalProperties: false,
});

export type Empty = SchemaType<typeof emptySchema>;

export const isEmpty = ajv.compile<Empty>(emptySchema.toJSON());
