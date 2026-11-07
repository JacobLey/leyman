import { bucket } from '@leyman/constant-consistent-hash-rust';
import testVectors from '@leyman/constant-consistent-hash-test-vectors/test-vectors.json' with {
    type: 'json',
};
import { consistentHash, hashKey } from '@leyman/constant-consistent-hash-wasm';
import { expect } from '@leyman/expect';
import * as typescript from 'constant-consistent-hash';
import { suite, test } from 'mocha-chain';

const { ranges, vectors } = testVectors;

suite('Through WASM', () => {
    test('Returns every test vector', () => {
        expect(vectors).to.have.length.greaterThan(0);
        for (const { description, key, seed, hash, buckets } of vectors) {
            expect(hashKey(key, { seed }), description).to.deep.equal(hash);
            expect(
                ranges.map(range => consistentHash(key, range, { seed })),
                description
            ).to.deep.equal(buckets);
        }
    });

    test('Defaults seed to 0', () => {
        expect(hashKey('key')).to.deep.equal(hashKey('key', { seed: 0 }));
        expect(consistentHash('key', 100)).to.equal(consistentHash('key', 100, { seed: 0 }));
    });

    test('Agrees with the TypeScript implementation on what vectors miss', () => {
        const keys = [
            // Lone surrogates are encoded as U+FFFD
            '\u{D800}',
            '\u{DC00}',
            'a\u{D83D}b',
            '\u{DE00}\u{D83D}',
            '�',
            // Every encoded length, and past a small inline buffer in the bindings
            'é€🌍',
            '🌍'.repeat(10_000),
            ...Array.from({ length: 1000 }, (_, i) => `key-${i}`),
        ];
        const seeds = [0, 1, 2 ** 32 - 1];
        const boundaries = [1, 2, 3, 2 ** 31, 2 ** 32, 2 ** 32 + 1, 2 ** 48 - 1, 2 ** 48];
        for (const key of keys) {
            for (const seed of seeds) {
                expect(hashKey(key, { seed })).to.deep.equal(typescript.hashKey(key, { seed }));
                for (const range of boundaries) {
                    expect(consistentHash(key, range, { seed })).to.equal(
                        typescript.consistentHash(key, range, { seed })
                    );
                }
            }
        }
    });

    test('Raises the same errors as the TypeScript implementation', () => {
        for (const range of [0, -1, 1.5, Number.NaN, 2 ** 48 + 1]) {
            expect(() => consistentHash('key', range)).to.throw(
                RangeError,
                `range must be an integer between 1 and 2^48, received ${range}`
            );
            expect(() => typescript.consistentHash('key', range)).to.throw(
                RangeError,
                `range must be an integer between 1 and 2^48, received ${range}`
            );
        }
        for (const seed of [-1, 1.5, Number.NaN, 2 ** 32]) {
            const message = `seed must be an integer between 0 and 2^32 - 1, received ${seed}`;
            expect(() => hashKey('key', { seed })).to.throw(RangeError, message);
            expect(() => consistentHash('key', 1, { seed })).to.throw(RangeError, message);
            expect(() => typescript.hashKey('key', { seed })).to.throw(RangeError, message);
        }
    });

    test('Rust raises its own error across the boundary', () => {
        // Unreachable through this package, which validates first
        expect(() => bucket('key', 0n, 0)).to.throw(
            Error,
            'buckets must be between 1 and 2^48, received 0'
        );
    });
});
