import DefaultAjv from 'ajv/dist/2020.js';
import { defaultImport } from 'npm-default-import';
import {
    arraySchema,
    objectSchema,
    type SchemaType,
    stringSchema,
} from 'npm-juniper';

const Ajv = defaultImport(DefaultAjv);

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

export const isTsConfig = new Ajv({
    strict: true,
}).compile<TsConfig>(tsConfigSchema.toJSON());
