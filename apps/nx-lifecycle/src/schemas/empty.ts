import type { SchemaType } from 'juniper';
import { objectSchema } from 'juniper';
import { makeValidator } from 'juniper-validator';

const emptySchema = objectSchema({
    additionalProperties: false,
});

export type Empty = SchemaType<typeof emptySchema>;

export const isEmpty = makeValidator(emptySchema).is;
