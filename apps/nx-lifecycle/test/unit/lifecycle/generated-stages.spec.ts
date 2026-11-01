import * as fc from 'fast-check';
import { makeArbitrary } from 'juniper-arbitrary';
import { suite, test } from 'mocha-chain';
import { planLifecycle } from '#internal/lifecycle/processor.js';
import { stagesSchema } from '#internal/lifecycle/schema.js';

suite('Generated stages', () => {
    test('Plans any stages the schema allows', () => {
        fc.assert(
            fc.property(makeArbitrary(stagesSchema), stages => {
                planLifecycle({ stages, bindings: {} });
            }),
            { seed: 42 }
        );
    });
});
