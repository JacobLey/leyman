import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import {
    IdempotencyKeyHeaderError,
    IdempotencyKeysError,
    parseIdempotencyKey,
} from 'idempotency-keys';
import { suite, test } from 'mocha-chain';
import { vectors } from '#test/helpers/vectors.js';

const valid = vectors.keys.filter(vector => !vector.error);
const invalid = vectors.keys.filter(vector => vector.error);

suite('parseIdempotencyKey', () => {
    for (const { description, header, key } of valid) {
        test(`Reads ${description}`, () => {
            expect(parseIdempotencyKey(header)).to.equal(key);
        });
    }

    for (const { description, header } of invalid) {
        test(`Rejects ${description}`, () => {
            expect(() => parseIdempotencyKey(header)).to.throw(IdempotencyKeyHeaderError);
        });
    }

    test('Throws an error of the package, holding the values', () => {
        expect(() => parseIdempotencyKey(['a', 'b']))
            .to.throw(IdempotencyKeysError)
            .with.property('values')
            .that.deep.equals(['a', 'b']);
    });

    test('Types the key as a string, or null without a header', () => {
        expectTypeOf(parseIdempotencyKey).returns.toEqualTypeOf<string | null>();
    });
});
