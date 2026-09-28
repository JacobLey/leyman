import * as vitest from 'vitest';
import { createVitestChain } from './lib/vitest-chain.js';

const chain = createVitestChain(vitest);

/**
 * Wrapper around Vitest's `describe`/`suite`.
 *
 * Ensures suites are not declared while a hook/test is executing.
 */
export const { describe } = chain;
/**
 * Wrapper around Vitest's `beforeAll`.
 *
 * Context returned from this method will be propagated to chained hooks/tests.
 */
export const { beforeAll } = chain;
/**
 * Wrapper around Vitest's `beforeEach`.
 *
 * Context returned from this method will be propagated to chained hooks/tests.
 */
export const { beforeEach } = chain;
/**
 * Wrapper around Vitest's `test`/`it`.
 *
 * Ensures tests are not declared while a hook/test is executing.
 */
export const { test } = chain;
/**
 * Wrapper around Vitest's `afterEach`.
 *
 * Context returned from this method will be propagated to chained hooks/tests.
 */
export const { afterEach } = chain;
/**
 * Wrapper around Vitest's `afterAll`.
 *
 * Context returned from this method will be propagated to chained hooks/tests.
 */
export const { afterAll } = chain;
export { describe as suite, test as it };
