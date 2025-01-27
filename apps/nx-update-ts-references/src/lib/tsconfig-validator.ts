import { Ajv2020 } from 'ajv/dist/2020.js';
import { arraySchema, objectSchema, type SchemaType, stringSchema } from 'npm-juniper';

const tsConfigSchema = objectSchema({
    properties: {
        references: arraySchema().items(
            objectSchema({
                properties: {
                    path: stringSchema(),
                },
                required: ['path'],
            })
        ),
    },
});

export type TsConfig = SchemaType<typeof tsConfigSchema>;

export const isTsConfig = new Ajv2020({
    strict: true,
}).compile<TsConfig>(tsConfigSchema.toJSON());
