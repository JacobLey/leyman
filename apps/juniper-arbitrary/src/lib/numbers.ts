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
 * Ajv tests `multipleOf` as `value / step === parseInt(value / step)`, and `parseInt` reads a quotient
 * of 1e21 or more from its exponential notation, so no such quotient passes:
 * https://github.com/ajv-validator/ajv/blob/v8.20.0/lib/vocabularies/validation/multipleOf.ts#L26-L29
 */
// The double just below 1e21
const largestAjvQuotient = 999_999_999_999_999_868_928;

/**
 * The first double past the safe integers: every double from here on is an integer.
 */
const firstUnsafe = Number.MAX_SAFE_INTEGER + 1;

interface Multiples {
    readonly arbitrary: fc.Arbitrary<number>;
    /**
     * Whether every value is exactly a multiple inside the bounds.
     */
    readonly exact: boolean;
}

/**
 * Multiples of a step from its multipliers.
 *
 * @param multipliers - arbitrary of integers
 * @param min - smallest multiplier
 * @param max - largest multiplier
 * @param step - multiplied by each
 * @returns the multiples, and whether they are exact
 */
const toMultiples = (
    multipliers: fc.Arbitrary<number>,
    min: number,
    max: number,
    step: number
): Multiples => ({
    arbitrary: multipliers.map(multiple => withoutNegativeZero(multiple * step)),
    // Past the safe integers a product rounds, and may land off the multiple or past a bound
    exact:
        step === 1 ||
        Math.max(Math.abs(min * step), Math.abs(max * step)) <= Number.MAX_SAFE_INTEGER,
});

/**
 * The odd integer a double is, scaled by a power of two.
 *
 * @param value - positive finite double
 * @returns odd integer `m` such that `value` is `m * 2 ** e` for some integer `e`
 */
const oddMantissa = (value: number): number => {
    let odd = value;
    // eslint-disable-next-line unicorn/prefer-number-is-safe-integer -- Asks if it is fractional, not if it is safe
    while (!Number.isInteger(odd)) {
        odd *= 2;
    }
    while (odd % 2 === 0) {
        odd /= 2;
    }
    return odd;
};

/**
 * Moves a multiplier to the nearest whose product with the step is exact: `j * 2 ** p`, where `j`
 * times the step's odd mantissa is still a safe integer, so the product is that safe integer scaled
 * by a power of two, and divides back to the multiplier.
 *
 * @param multiplier - any integer
 * @param largestFactor - largest `j`
 * @returns nearby multiplier with an exact product
 */
const exactMultiplier = (multiplier: number, largestFactor: number): number => {
    const size = Math.abs(multiplier);
    let scale = 2 ** Math.max(0, Math.floor(Math.log2(size / largestFactor)));
    while (size / scale > largestFactor) {
        scale *= 2;
    }
    return Math.round(multiplier / scale) * scale;
};

/**
 * Multiples of a step inside the bounds.
 *
 * Values stay safe integers when any fit, since those are the values code meets most. Otherwise the
 * multipliers are drawn from all of the bounds, and moved to the nearest whose product is exact. Past
 * the safe integers every double is an integer, so a fractional step keeps them as drawn: its
 * products round, but the quotient is still an integer.
 *
 * @param lower - lower bound
 * @param upper - upper bound
 * @param step - every value is a multiple of this
 * @param isAjvMultiple - whether ajv's `multipleOf` checks the quotient, which caps it below 1e21
 * @returns arbitrary of the multiples inside the bounds, or null if there are none
 */
const multiples = (
    lower: Bound,
    upper: Bound,
    step: number,
    isAjvMultiple: boolean
): Multiples | null => {
    const limit = Math.floor(
        Math.min(isAjvMultiple ? largestAjvQuotient : Number.MAX_VALUE, Number.MAX_VALUE / step)
    );
    let min = Math.max(Math.ceil(lower.value / step), -limit);
    let max = Math.min(Math.floor(upper.value / step), limit);
    // The quotient rounds, to zero when the bound is tiny next to the step
    if (min * step < lower.value) {
        min++;
    }
    if (max * step > upper.value) {
        max--;
    }
    const isMinExcluded = lower.exclusive && min * step === lower.value;
    const isMaxExcluded = upper.exclusive && max * step === upper.value;

    const safeLimit = Math.min(Math.floor(Number.MAX_SAFE_INTEGER / step), Number.MAX_SAFE_INTEGER);
    const safeMin = Math.max(min + Number(isMinExcluded), -safeLimit);
    const safeMax = Math.min(max - Number(isMaxExcluded), safeLimit);
    if (safeMin <= safeMax) {
        return toMultiples(fc.integer({ min: safeMin, max: safeMax }), safeMin, safeMax, step);
    }
    if (min > max || (min === max && (isMinExcluded || isMaxExcluded))) {
        return null;
    }
    const largestFactor = Math.floor(Number.MAX_SAFE_INTEGER / oddMantissa(step));
    // eslint-disable-next-line unicorn/prefer-number-is-safe-integer -- Asks if it is fractional, not if it is safe
    const isStepInteger = Number.isInteger(step);
    const isInside = (multiplier: number): boolean =>
        (isMinExcluded ? multiplier > min : multiplier >= min) &&
        (isMaxExcluded ? multiplier < max : multiplier <= max);
    return toMultiples(
        fc
            .double({
                min,
                max,
                minExcluded: isMinExcluded,
                maxExcluded: isMaxExcluded,
                noNaN: true,
            })
            .map(multiplier => {
                if (!isStepInteger && Math.abs(multiplier) >= firstUnsafe) {
                    return multiplier;
                }
                const exact = exactMultiplier(multiplier, largestFactor);
                // Bounds too close together may hold no exact product. Past the safe integers
                // any double still divides to an integer, and nearer the validator has the say
                return isInside(exact) ? exact : multiplier;
            }),
        min,
        max,
        step
    );
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
        const result = multiples(lower, upper, step ?? 1, step !== null);
        return (
            result && {
                arbitrary: result.arbitrary,
                // Multiplying a fraction rounds, and may land off the multiple
                exact: result.exact && branch.multipleOf.length <= 1 && isStepInteger,
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
    const integers = multiples(lower, upper, 1, false);
    return {
        arbitrary: integers ? fc.oneof(doubles, integers.arbitrary) : doubles,
        exact: true,
    };
};
