import { createContainer } from 'haystack-di';
import { describe } from 'mocha';
import { contextualHookModule } from '#contextual-module';
import { mochaModule } from '#mocha-module';
import { entrypointAfterIdentifier } from './lib/after-hooks.js';
import { entrypointAfterEachIdentifier } from './lib/after-each-hooks.js';
import { entrypointBeforeEachIdentifier } from './lib/before-each-hooks.js';
import { entrypointBeforeIdentifier } from './lib/before-hooks.js';
import { entrypointTestIdentifier } from './lib/test-hooks.js';

export {
    describe,
    describe as context,
    suite,
} from 'mocha';

const container = createContainer(
    mochaModule.mergeModule(contextualHookModule)
);

/**
 * Wrapper around Mocha's `before`/`suiteSetup`.
 *
 * Context returned from this method will be propagated to chained hooks/tests.
 */
export const before = container.getSync(entrypointBeforeIdentifier);
/**
 * Wrapper around Mocha's `beforeEach`/`setup`.
 *
 * Context returned from this method will be propagated to chained hooks/tests.
 */
export const beforeEach = container.getSync(entrypointBeforeEachIdentifier);
export const xdescribe = describe.skip;
/**
 * Wrapper around Mocha's `test`.
 *
 * Ensures that tests are not accidentally instantiated internally, which currently
 * is silently ignored: https://github.com/mochajs/mocha/issues/4525
 */
export const test = container.getSync(entrypointTestIdentifier);
export const xit = test.skip;
/**
 * Wrapper around Mocha's `afterEach`/`teardown`.
 *
 * Context returned from this method will be propagated to chained hooks/tests.
 */
export const afterEach = container.getSync(entrypointAfterEachIdentifier);
/**
 * Wrapper around Mocha's `after`/`suiteTeardown`.
 *
 * Context returned from this method will be propagated to chained hooks/tests.
 */
export const after = container.getSync(entrypointAfterIdentifier);
export {
    before as suiteSetup,
    beforeEach as setup,
    test as it,
    test as specify,
    afterEach as teardown,
    after as suiteTeardown,
};
