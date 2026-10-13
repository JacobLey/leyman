import { suite, test } from 'mocha';
import { expect } from '@leyman/expect';
import * as publicErrors from 'haywire';
import * as errors from '#errors';

suite('errors', () => {
    test('Every error class is exported', () => {
        const errorClasses = Object.entries(errors).filter(([name]) => name.startsWith('Haywire'));
        expect(errorClasses).to.have.length(16);
        for (const [name, errorClass] of errorClasses) {
            expect(publicErrors).to.have.property(name, errorClass);
        }
    });
});
