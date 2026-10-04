import type { SchemaType } from 'juniper';
import type { JuniperValidator } from 'juniper-validator';
import { objectSchema } from 'juniper';
import { makeValidator } from 'juniper-validator';
import { allTargetsSchema } from './target.js';

const nxJsonSchema = objectSchema({
    properties: {
        targetDefaults: allTargetsSchema,
    },
    additionalProperties: true,
});
export type NxJson = SchemaType<typeof nxJsonSchema>;

export const assertNxJson: JuniperValidator<NxJson>['assert'] = makeValidator(nxJsonSchema).assert;
