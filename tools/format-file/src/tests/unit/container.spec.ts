import { suite, test } from 'mocha-chain';
import { formatFileContainer } from '../../container.js';

suite('container', () => {
    test('passes check', () => {
        formatFileContainer.check();
    });
});
