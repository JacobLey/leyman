import type { SchemaType } from 'juniper';
import { identifier } from 'haywire';
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

export const assertLifecyclePluginOptions = makeValidator(lifecyclePluginOptionsSchema).assert;
export type AssertLifecyclePluginOptions = typeof assertLifecyclePluginOptions;
export const assertLifecyclePluginOptionsId = identifier<AssertLifecyclePluginOptions>();
