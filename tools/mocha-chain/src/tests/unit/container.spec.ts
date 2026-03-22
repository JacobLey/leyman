import { suite, test } from 'mocha-chain';
import { container } from '../../lib/container.js';

suite('container', () => {
    test('passes check', () => {
        container.check();
    });
});
