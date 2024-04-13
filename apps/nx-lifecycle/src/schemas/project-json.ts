import type { ErrorObject } from 'ajv';
import { identifier } from 'haystack-di';
import { objectSchema, type SchemaType } from 'juniper';
import { ajv } from './lib/ajv.js';
import { allTargetsSchema } from './target.js';

const projectJsonSchema = objectSchema({
    properties: {
        targets: allTargetsSchema,
    },
    additionalProperties: true,
});

export type ProjectJson = SchemaType<typeof projectJsonSchema>;

export interface IsProjectJson {
    (val: unknown): val is ProjectJson;
    errors?: null | ErrorObject[];
}
export const isProjectJson: IsProjectJson = ajv.compile<ProjectJson>(
    projectJsonSchema.toJSON()
);
export const isProjectJsonIdentifier =
    identifier<IsProjectJson>().named('projectJson');
