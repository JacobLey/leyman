import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import lifecycle from '#internal/executors/lifecycle/index.js';

suite('entrypoint', () => {
    test('Default export is the executor', () => {
        expect(lifecycle).to.be.a('function');
    });
});
