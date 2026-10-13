import type { ConsistentHashOptions } from 'constant-consistent-hash';
import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import { consistentHash } from 'constant-consistent-hash';
import { suite, test } from 'mocha-chain';

const keys = Array.from(
    { length: 1000 },
    (_, i) => `00000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`
);

const ranges = [1, 2, 7, 100, 2 ** 32 + 1, 2 ** 33, 2 ** 48];

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
                [0, 1, 3, 3, 492_999_177, 8_355_416_591, 196_931_321_734_519],
                [0, 1, 1, 1, 2_155_994_471, 2_155_994_471, 251_679_376_480_816],
                [0, 1, 2, 72, 646_540_009, 646_540_009, 220_601_612_818_386],
                [0, 1, 4, 35, 2_134_807_116, 5_732_551_356, 264_896_018_877_297],
            ]);
        });

        test('Each UTF-8 encoded length', () => {
            expect(
                ['߿', '￿', '\u{10FFFF}'].map(key => ranges.map(range => consistentHash(key, range)))
            ).to.deep.equal([
                [0, 1, 3, 32, 385_317_643, 385_317_643, 182_888_553_428_527],
                [0, 1, 2, 35, 1_496_020_030, 7_148_775_881, 37_524_400_643_132],
                [0, 0, 0, 77, 2_520_267_493, 6_849_465_656, 106_265_442_010_545],
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
                [0, 0, 0, 90, 1_046_419_957, 1_046_419_957, 143_379_080_937_832],
                [0, 0, 3, 23, 1_128_034_004, 1_128_034_004, 130_044_798_712_786],
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

    test('Moves almost no keys when a large range grows by one', () => {
        // Each block boundary where positions switch from one random word to two
        const froms = [2 ** 31, 2 ** 32, 2 ** 32 + 2 ** 31, 2 ** 33, 2 ** 47, 2 ** 48 - 1];

        // Expect 1000/range keys to move, so about 0
        expect(
            froms.map(
                from =>
                    keys.filter(key => consistentHash(key, from) !== consistentHash(key, from + 1))
                        .length
            )
        ).to.deep.equal(froms.map(() => 0));
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
