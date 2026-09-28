import * as mocha from 'mocha';
import { createMochaChain } from './lib/mocha-chain.js';

const chain = createMochaChain(mocha);

export const { suite } = chain;

/**
 * Wrapper around Mocha's `before`/`suiteSetup`.
 *
 * Context returned from this method will be propagated to chained hooks/tests.
 */
export const { before } = chain;
/**
 * Wrapper around Mocha's `beforeEach`/`setup`.
 *
 * Context returned from this method will be propagated to chained hooks/tests.
 */
export const { beforeEach } = chain;
export const xdescribe = suite.skip;
/**
 * Wrapper around Mocha's `test`.
 *
 * Ensures that tests are not accidentally instantiated internally, which currently
 * is silently ignored: https://github.com/mochajs/mocha/issues/4525
 */
export const { test } = chain;
export const xit = test.skip;
/**
 * Wrapper around Mocha's `afterEach`/`teardown`.
 *
 * Context returned from this method will be propagated to chained hooks/tests.
 */
export const { afterEach } = chain;
/**
 * Wrapper around Mocha's `after`/`suiteTeardown`.
 *
 * Context returned from this method will be propagated to chained hooks/tests.
 */
export const { after } = chain;
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
