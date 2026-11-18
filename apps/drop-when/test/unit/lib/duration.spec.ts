import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { parseMinAge } from '#internal/lib/duration.js';

suite('parseMinAge', () => {
    test('Reads days as 24 hours each', () => {
        expect(parseMinAge('7d')?.total('hours')).to.equal(168);
    });

    test('Reads hours', () => {
        expect(parseMinAge('12h')?.total('hours')).to.equal(12);
    });

    test('Reads zero', () => {
        expect(parseMinAge('0d')?.total('hours')).to.equal(0);
    });

    test('Rejects anything else', () => {
        expect(parseMinAge('1w')).to.equal(null);
    });
});
