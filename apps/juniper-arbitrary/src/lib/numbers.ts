import type { Branch } from './flatten.js';
import * as fc from 'fast-check';

export interface NumberResult {
    readonly arbitrary: fc.Arbitrary<number>;
    readonly exact: boolean;
}

interface Bound {
    readonly exclusive: boolean;
    readonly value: number;
}

const lowerBound = ({ exclusiveMinimum, minimum }: Branch): Bound =>
    exclusiveMinimum >= minimum
        ? { exclusive: true, value: exclusiveMinimum }
        : { exclusive: false, value: minimum };

const upperBound = ({ exclusiveMaximum, maximum }: Branch): Bound =>
    exclusiveMaximum <= maximum
        ? { exclusive: true, value: exclusiveMaximum }
        : { exclusive: false, value: maximum };

// `-0` doesn't survive JSON, so a generated value could differ from itself after a round trip
const withoutNegativeZero = (value: number): number => value + 0;

/**
 * Every multiple of a step inside the bounds.
 *
 * @param lower - lower bound
 * @param upper - upper bound
 * @param step - every value is a multiple of this
 * @returns arbitrary of the multiples inside the bounds, or null if there are none
 */
const multiples = (lower: Bound, upper: Bound, step: number): fc.Arbitrary<number> | null => {
    const limit = Math.floor(Number.MAX_SAFE_INTEGER / step);
    let min = Math.max(Math.ceil(lower.value / step), -limit);
    let max = Math.min(Math.floor(upper.value / step), limit);
    if (lower.exclusive && min * step === lower.value) {
        min++;
    }
    if (upper.exclusive && max * step === upper.value) {
        max--;
    }
    return min > max
        ? null
        : fc.integer({ min, max }).map(multiple => withoutNegativeZero(multiple * step));
};

/**
 * Numbers satisfying the branch.
 *
 * @param branch - constraints
 * @param isInteger - whether only integers match
 * @returns number arbitrary, or null when no number can match
 */
export const numberArbitrary = (branch: Branch, isInteger: boolean): NumberResult | null => {
    const lower = lowerBound(branch);
    const upper = upperBound(branch);
    // Any multiple of the largest step is the likeliest to be a multiple of the others
    const step = branch.multipleOf.length > 0 ? Math.max(...branch.multipleOf) : null;
    // eslint-disable-next-line unicorn/prefer-number-is-safe-integer -- Asks if it is fractional, not if it is safe
    const isStepInteger = step === null || Number.isInteger(step);

    if (step !== null || isInteger) {
        const arbitrary = multiples(lower, upper, step ?? 1);
        return (
            arbitrary && {
                arbitrary,
                // Multiplying a fraction rounds, and may land off the multiple
                exact: branch.multipleOf.length <= 1 && isStepInteger,
            }
        );
    }

    if (
        lower.value > upper.value ||
        (lower.value === upper.value && (lower.exclusive || upper.exclusive))
    ) {
        return null;
    }
    const doubles = fc
        .double({
            noDefaultInfinity: true,
            noNaN: true,
            ...(lower.value > Number.NEGATIVE_INFINITY && {
                min: lower.value,
                minExcluded: lower.exclusive,
            }),
            ...(upper.value < Number.POSITIVE_INFINITY && {
                max: upper.value,
                maxExcluded: upper.exclusive,
            }),
        })
        .map(withoutNegativeZero);
    // Doubles spread evenly over their representation, so nearly all are huge or tiny.
    // Integers bring in the everyday values, which is where most code has its bugs
    const integers = multiples(lower, upper, 1);
    return {
        arbitrary: integers ? fc.oneof(doubles, integers) : doubles,
        exact: true,
    };
};
