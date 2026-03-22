import { suite, test } from 'mocha-chain';
import { handlerContainer } from '../../container.js';

suite('container', () => {
    test('passes check', () => {
        handlerContainer.check();
    });
});
