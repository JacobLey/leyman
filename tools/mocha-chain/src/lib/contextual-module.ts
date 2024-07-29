import { afterEachModule } from './after-each-hooks.js';
import { afterModule } from './after-hooks.js';
import { beforeEachModule } from './before-each-hooks.js';
import { beforeModule } from './before-hooks.js';
import { suiteModule } from './suite-hooks.js';
import { testModule } from './test-hooks.js';

/**
 * Load each implemention into DI.
 */
export const contextualHookModule = suiteModule
    .mergeModule(beforeModule)
    .mergeModule(beforeEachModule)
    .mergeModule(testModule)
    .mergeModule(afterEachModule)
    .mergeModule(afterModule);
