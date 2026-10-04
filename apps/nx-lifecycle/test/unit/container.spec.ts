import { suite, test } from 'mocha-chain';
import { cliContainer } from '#internal/bin.js';
import { lifecycleContainer } from '#internal/executors/lifecycle/container.js';

suite('container', () => {
    test('executor passes check', () => {
        lifecycleContainer.check();
    });

    test('bin passes check', () => {
        cliContainer.check();
    });
});
