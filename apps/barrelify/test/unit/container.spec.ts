import { suite, test } from 'mocha-chain';
import { cliContainer } from '#internal/bin.js';
import { barrelifyContainer } from '#internal/container.js';

suite('containers', () => {
    test('index', () => {
        barrelifyContainer.check();
    });

    test('bin', () => {
        cliContainer.check();
    });
});
