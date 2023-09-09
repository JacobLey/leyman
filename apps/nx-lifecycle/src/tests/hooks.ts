import { use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import type { RootHookObject } from 'mocha';
import { verifyAndRestore } from 'sinon';

use(chaiAsPromised);

export const mochaHooks: RootHookObject = {
    afterEach() {
        verifyAndRestore();
    },
};