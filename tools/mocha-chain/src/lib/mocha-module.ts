import { after, afterEach, before, beforeEach, suite, test } from 'mocha';
import { bind, createModule, identifier } from 'haywire';

export const afterIdentifier = identifier<typeof after>().named('after');
export const afterEachIdentifier = identifier<typeof afterEach>().named('afterEach');
export const beforeIdentifier = identifier<typeof before>().named('before');
export const beforeEachIdentifier = identifier<typeof beforeEach>().named('beforeEach');
export const suiteIdentifier = identifier<typeof suite>().named('suite');
export const testIdentifier = identifier<typeof test>().named('test');

/**
 * Load all mocha's hook/test implementations into DI.
 */
export const mochaModule = createModule(bind(afterIdentifier).withInstance(after))
    .addBinding(bind(afterEachIdentifier).withInstance(afterEach))
    .addBinding(bind(beforeIdentifier).withInstance(before))
    .addBinding(bind(beforeEachIdentifier).withInstance(beforeEach))
    .addBinding(bind(suiteIdentifier).withInstance(suite))
    .addBinding(bind(testIdentifier).withInstance(test));
