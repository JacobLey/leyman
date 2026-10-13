import { suite, test } from 'mocha';
import { expect } from '@leyman/expect';
import { identifier } from 'haywire';
import * as publicErrors from 'haywire';
import * as errors from '#errors';

suite('errors', () => {
    test('Every error class is exported', () => {
        const errorClasses = Object.entries(errors).filter(([name]) => name.startsWith('Haywire'));
        expect(errorClasses).to.have.length(17);
        for (const [name, errorClass] of errorClasses) {
            expect(publicErrors).to.have.property(name, errorClass);
        }
    });

    test('Request path is not enumerable', () => {
        const path = [identifier<string>('A'), identifier<string>('B')];
        const error = new errors.HaywireNullResponseError(path[1]!, path);
        expect(error.requestPath).to.equal(path);
        expect(Object.keys(error)).to.not.include('requestPath');
    });
});
