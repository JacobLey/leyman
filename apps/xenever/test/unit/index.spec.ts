import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { packageName } from 'xenever';

suite('xenever', () => {
    test('Exports its name', () => {
        expect(packageName).to.equal('xenever');
    });
});
