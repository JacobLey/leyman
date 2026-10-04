import type { SchemaType } from 'juniper';
import type { JuniperValidator } from 'juniper-validator';
import { objectSchema } from 'juniper';
import { makeValidator } from 'juniper-validator';
import { bindingsSchema, stagesSchema } from '../lifecycle/schema.js';

const lifecyclePluginOptionsSchema = objectSchema({
    title: 'nx-lifecycle plugin',
    description: 'Infer Nx targets as high level workflows',
    properties: {
        stages: stagesSchema,
        bindings: bindingsSchema,
    },
    required: ['stages', 'bindings'],
    additionalProperties: false,
});
export type LifecyclePluginOptions = SchemaType<typeof lifecyclePluginOptionsSchema>;

export const assertLifecyclePluginOptions: JuniperValidator<LifecyclePluginOptions>['assert'] =
    makeValidator(lifecyclePluginOptionsSchema).assert;
