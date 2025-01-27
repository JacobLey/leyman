import { Ajv2020 } from 'ajv/dist/2020.js';
import { objectSchema, type SchemaType, stringSchema } from 'npm-juniper';

const projectJsonSchema = objectSchema({
    properties: {
        name: stringSchema(),
    },
    required: ['name'],
});

export type ProjectJson = SchemaType<typeof projectJsonSchema>;

export const isProjectJson = new Ajv2020({
    strict: true,
}).compile<ProjectJson>(projectJsonSchema.toJSON());
