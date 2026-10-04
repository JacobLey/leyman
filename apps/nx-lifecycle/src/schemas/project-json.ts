import type { SchemaType } from 'juniper';
import type { JuniperValidator } from 'juniper-validator';
import { objectSchema } from 'juniper';
import { makeValidator } from 'juniper-validator';
import { allTargetsSchema } from './target.js';

const projectJsonSchema = objectSchema({
    properties: {
        targets: allTargetsSchema,
    },
    additionalProperties: true,
});
export type ProjectJson = SchemaType<typeof projectJsonSchema>;

export const assertProjectJson: JuniperValidator<ProjectJson>['assert'] =
    makeValidator(projectJsonSchema).assert;
