import { suite, test } from 'mocha-chain';
import { cliContainer } from '../../bin.js';
import { lifecycleContainer } from '../../executors/lifecycle/container.js';

suite('container', () => {
    test('executor passes check', () => {
        lifecycleContainer.check();
    });

    test('bin passes check', () => {
        cliContainer.check();
    });
});
