import { suite, test } from 'mocha-chain';
import { cliContainer } from '../../bin.js';
import { loadPopulateContainer } from '../../container.js';

suite('container', () => {
    test('index passes check', () => {
        loadPopulateContainer.check();
    });

    test('bin passes check', () => {
        cliContainer.check();
    });
});
