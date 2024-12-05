import DefaultAjv from 'ajv/dist/2020.js';
import { defaultImport } from 'npm-default-import';
import { objectSchema, type SchemaType, stringSchema } from 'npm-juniper';

const Ajv = defaultImport(DefaultAjv);

const projectJsonSchema = objectSchema({
    properties: {
        name: stringSchema(),
    },
    required: ['name'],
});

export type ProjectJson = SchemaType<typeof projectJsonSchema>;

export const isProjectJson = new Ajv({
    strict: true,
}).compile<ProjectJson>(projectJsonSchema.toJSON());
