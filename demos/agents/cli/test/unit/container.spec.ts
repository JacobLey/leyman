import { cliContainer } from '@leyman/demo-agents-cli';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';

suite('cliContainer', () => {
    test('Is wired', () => {
        expect(() => {
            cliContainer.check();
        }).to.not.throw();
    });
});
