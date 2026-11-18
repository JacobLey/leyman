import { suite, test } from 'mocha-chain';
import { cliContainer } from '#internal/container.js';

suite('container', () => {
    test('check', () => {
        cliContainer.check();
    });
});
