import type { ConsistentHashOptions } from 'constant-consistent-hash';
import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import { consistentHash } from 'constant-consistent-hash';
import { suite, test } from 'mocha-chain';

const keys = Array.from(
    { length: 1000 },
    (_, i) => `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`
);

const ranges = [1, 2, 7, 100, 2 ** 32 + 1, 2 ** 48];

/**
 * Number of keys that changed bucket when range grew by one, but not to the new bucket.
 *
 * @param from - range before growing
 * @param [options] - passed to consistentHash
 * @returns count of keys that moved to an existing bucket
 */
const countDisruptions = (from: number, options?: ConsistentHashOptions): number =>
    keys.filter(key => {
        const before = consistentHash(key, from, options);
        const after = consistentHash(key, from + 1, options);
        return before !== after && after !== from;
    }).length;

suite('consistentHash', () => {
    test('types', () => {
        expectTypeOf(consistentHash).toEqualTypeOf<
            (key: string, range: number, options?: ConsistentHashOptions) => number
        >();
    });

    suite('Matches test vectors', () => {
        // Shared with other language implementations, see SPEC.md
        test('Default seed', () => {
            expect(
                ['', 'a', '00000000-0000-4000-8000-000000000000', 'héllo 🌍'].map(key =>
                    ranges.map(range => consistentHash(key, range))
                )
            ).to.deep.equal([
                [0, 0, 5, 40, 1_032_688_306, 274_793_043_325_099],
                [0, 0, 0, 33, 2_312_967_350, 47_323_351_833_859],
                [0, 1, 6, 28, 112_258_478, 181_633_977_207_240],
                [0, 0, 0, 17, 1_733_140_221, 200_283_044_854_715],
            ]);
        });

        test('Each UTF-8 encoded length', () => {
            expect(
                ['߿', '￿', '\u{10FFFF}'].map(key => ranges.map(range => consistentHash(key, range)))
            ).to.deep.equal([
                [0, 1, 2, 37, 1_981_301_467, 179_045_220_803_231],
                [0, 1, 1, 17, 3_841_734_732, 156_173_929_975_538],
                [0, 1, 5, 50, 3_118_155_352, 165_607_780_543_953],
            ]);
        });

        test('Seeded', () => {
            expect(
                [1, 2 ** 32 - 1].map(seed =>
                    ranges.map(range =>
                        consistentHash('00000000-0000-4000-8000-000000000000', range, { seed })
                    )
                )
            ).to.deep.equal([
                [0, 0, 4, 74, 1_283_474_075, 207_493_669_313_094],
                [0, 1, 2, 9, 2_973_883_913, 43_496_619_248_832],
            ]);
        });
    });

    test('Lone surrogates hash as U+FFFD', () => {
        const pairs = [
            ['a\u{D800}b', 'a�b'],
            ['\u{DC00}', '�'],
            ['x\u{D83C}', 'x�'],
            ['\u{D83C}🌍', '�🌍'],
        ] as const;

        expect(
            pairs.map(([lone]) => ranges.map(range => consistentHash(lone, range)))
        ).to.deep.equal(
            pairs.map(([, replaced]) => ranges.map(range => consistentHash(replaced, range)))
        );
    });

    test('Returns an integer bucket within range', () => {
        const buckets = ranges.flatMap(range =>
            keys.map(key => consistentHash(key, range) / range)
        );

        expect(buckets.every(ratio => ratio >= 0 && ratio < 1)).to.equal(true);
        expect(
            ranges.every(range =>
                keys.every(key => Number.isSafeInteger(consistentHash(key, range)))
            )
        ).to.equal(true);
    });

    test('Balances keys across buckets', () => {
        const range = 7;
        const total = 70_000;
        const counts = Array.from({ length: range }, () => 0);
        for (let i = 0; i < total; i++) {
            const bucket = consistentHash(`key-${i}`, range);
            counts[bucket] = (counts[bucket] ?? 0) + 1;
        }

        const expected = total / range;
        const chiSquare = counts.reduce(
            (sum, count) => sum + (count - expected) ** 2 / expected,
            0
        );
        // 99.9th percentile of chi-square with 6 degrees of freedom
        expect(chiSquare).to.be.lessThan(22.46);
    });

    suite('Growing the range only moves keys to the new bucket', () => {
        test('Small ranges', () => {
            expect(
                Array.from({ length: 200 }, (_, i) => countDisruptions(i + 1)).reduce(
                    (a, b) => a + b,
                    0
                )
            ).to.equal(0);
        });

        test('Around 2^32', () => {
            expect(countDisruptions(2 ** 32 - 1) + countDisruptions(2 ** 32)).to.equal(0);
        });

        test('Up to 2^48', () => {
            expect(countDisruptions(2 ** 48 - 1)).to.equal(0);
        });

        test('Seeded', () => {
            expect(
                Array.from({ length: 100 }, (_, i) =>
                    countDisruptions(i + 1, { seed: 123 })
                ).reduce((a, b) => a + b, 0)
            ).to.equal(0);
        });
    });

    test('Moves 1/range of keys when range grows by one', () => {
        const moved = keys.filter(key => consistentHash(key, 9) !== consistentHash(key, 10)).length;

        // Expect 100, standard deviation ~9.5
        expect(moved).to.be.within(70, 130);
    });

    suite('Seed', () => {
        test('Defaults to 0', () => {
            expect(keys.map(key => consistentHash(key, 100, {}))).to.deep.equal(
                keys.map(key => consistentHash(key, 100, { seed: 0 }))
            );
        });

        test('Selects an independent hash', () => {
            const same = keys.filter(
                key => consistentHash(key, 100) === consistentHash(key, 100, { seed: 1 })
            ).length;

            // Expect 1/100 of keys (10) to match by chance
            expect(same).to.be.lessThan(30);
        });
    });

    suite('Invalid input', () => {
        test('Range must be an integer between 1 and 2^48', () => {
            for (const range of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 48 + 1]) {
                expect(() => consistentHash('key', range)).to.throw(RangeError);
            }
        });

        test('Seed must be an integer between 0 and 2^32 - 1', () => {
            for (const seed of [-1, 1.5, Number.NaN, 2 ** 32]) {
                expect(() => consistentHash('key', 10, { seed })).to.throw(RangeError);
            }
        });
    });
});
