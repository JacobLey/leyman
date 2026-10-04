import { suite, test } from 'mocha-chain';
import { formatFileContainer } from '#lib';

suite('container', () => {
    test('check', () => {
        formatFileContainer.check();
    });
});
