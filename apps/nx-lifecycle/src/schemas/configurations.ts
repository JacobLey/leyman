import { objectSchema, type SchemaType } from 'juniper';

export const configurationsSchema = objectSchema().oneOf([
    objectSchema({
        properties: {
            __lifecycle: false,
        },
        additionalProperties: true,
    }),
    objectSchema({
        properties: {
            __lifecycle: objectSchema({ additionalProperties: false }),
        },
        required: ['__lifecycle'],
        additionalProperties: false,
    }),
]);

export type Configurations = SchemaType<typeof configurationsSchema>;
