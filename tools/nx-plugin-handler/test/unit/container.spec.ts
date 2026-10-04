import { suite, test } from 'mocha-chain';
import { handlerContainer } from '#internal/container.js';

suite('container', () => {
    test('passes check', () => {
        handlerContainer.check();
    });
});
