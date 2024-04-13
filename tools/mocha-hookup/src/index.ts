import { createContainer } from 'haywire';
import { contextualHookModule } from '#contextual-module';
import { mochaModule } from '#mocha-module';
import { entrypointAfterEachIdentifier } from './lib/after-each-hooks.js';
import { entrypointAfterIdentifier } from './lib/after-hooks.js';
import { entrypointBeforeEachIdentifier } from './lib/before-each-hooks.js';
import { entrypointBeforeIdentifier } from './lib/before-hooks.js';
import { contextualSuiteIdentifier } from './lib/suite-hooks.js';
import { entrypointTestIdentifier } from './lib/test-hooks.js';

const container = createContainer(
    mochaModule.mergeModule(contextualHookModule)
);

export const suite = container.get(contextualSuiteIdentifier);

/**
 * Wrapper around Mocha's `before`/`suiteSetup`.
 *
 * Context returned from this method will be propagated to chained hooks/tests.
 */
export const before = container.get(entrypointBeforeIdentifier);
/**
 * Wrapper around Mocha's `beforeEach`/`setup`.
 *
 * Context returned from this method will be propagated to chained hooks/tests.
 */
export const beforeEach = container.get(entrypointBeforeEachIdentifier);
export const xdescribe = suite.skip;
/**
 * Wrapper around Mocha's `test`.
 *
 * Ensures that tests are not accidentally instantiated internally, which currently
 * is silently ignored: https://github.com/mochajs/mocha/issues/4525
 */
export const test = container.get(entrypointTestIdentifier);
export const xit = test.skip;
/**
 * Wrapper around Mocha's `afterEach`/`teardown`.
 *
 * Context returned from this method will be propagated to chained hooks/tests.
 */
export const afterEach = container.get(entrypointAfterEachIdentifier);
/**
 * Wrapper around Mocha's `after`/`suiteTeardown`.
 *
 * Context returned from this method will be propagated to chained hooks/tests.
 */
export const after = container.get(entrypointAfterIdentifier);
export {
    suite as describe,
    suite as context,
    before as suiteSetup,
    beforeEach as setup,
    test as it,
    test as specify,
    afterEach as teardown,
    after as suiteTeardown,
};
