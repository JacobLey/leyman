import { suite, test } from 'mocha-chain';
import { cliContainer } from '../../bin.js';
import { barrelifyContainer } from '../../container.js';

suite('containers', () => {
    test('index', () => {
        barrelifyContainer.check();
    });

    test('bin', () => {
        cliContainer.check();
    });
});
