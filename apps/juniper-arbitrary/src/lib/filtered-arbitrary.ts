import * as fc from 'fast-check';
import { UnsatisfiableSchemaError } from './errors.js';

/**
 * How many values in a row may be rejected before giving up on generating one.
 *
 * Far more than any schema that generates reasonably needs, so that it only trips on one that
 * would otherwise be slow and useless.
 */
const maxAttempts = 1000;

/**
 * `.filter()` for a predicate that may never pass. fast-check's retries forever, so a schema
 * nothing can satisfy would hang the test run rather than fail it.
 *
 * @template T type of the values
 */
class FilteredArbitrary<T> extends fc.Arbitrary<T> {
    readonly #arbitrary: fc.Arbitrary<T>;
    readonly #path: string;
    readonly #isValid: (value: T) => boolean;

    public constructor(arbitrary: fc.Arbitrary<T>, isValid: (value: T) => boolean, path: string) {
        super();
        this.#arbitrary = arbitrary;
        this.#isValid = isValid;
        this.#path = path;
    }

    public override generate(random: fc.Random, biasFactor: number | undefined): fc.Value<T> {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const value = this.#arbitrary.generate(random, biasFactor);
            if (this.#isValid(value.value)) {
                return value;
            }
        }
        throw new UnsatisfiableSchemaError(
            `No valid value found in ${maxAttempts} attempts`,
            this.#path
        );
    }

    public override canShrinkWithoutContext(value: unknown): value is T {
        return this.#arbitrary.canShrinkWithoutContext(value) && this.#isValid(value);
    }

    public override shrink(value: T, context: unknown): fc.Stream<fc.Value<T>> {
        return this.#arbitrary.shrink(value, context).filter(shrunk => this.#isValid(shrunk.value));
    }
}

/**
 * Keep only the values that pass, failing loudly if none do.
 *
 * @param arbitrary - source of values
 * @param isValid - whether to keep a value
 * @param path - schema path, for the error when nothing passes
 * @returns arbitrary of the values that pass
 */
export const filtered = <T>(
    arbitrary: fc.Arbitrary<T>,
    isValid: (value: T) => boolean,
    path: string
): fc.Arbitrary<T> => new FilteredArbitrary(arbitrary, isValid, path);

/**
 * An arbitrary defined later, for schemas that reach themselves.
 *
 * @template T type of the values
 */
export class LazyArbitrary<T> extends fc.Arbitrary<T> {
    readonly #path: string;
    readonly #resolve: () => fc.Arbitrary<T>;

    public constructor(resolve: () => fc.Arbitrary<T>, path: string) {
        super();
        this.#resolve = resolve;
        this.#path = path;
    }

    public override generate(random: fc.Random, biasFactor: number | undefined): fc.Value<T> {
        try {
            return this.#resolve().generate(random, biasFactor);
        } catch (error) {
            // Every path through a schema like `{ next: <itself> }` requires going one level deeper
            if (error instanceof RangeError) {
                throw new UnsatisfiableSchemaError('Recursion never bottoms out', this.#path);
            }
            throw error;
        }
    }

    public override canShrinkWithoutContext(value: unknown): value is T {
        return this.#resolve().canShrinkWithoutContext(value);
    }

    public override shrink(value: T, context: unknown): fc.Stream<fc.Value<T>> {
        return this.#resolve().shrink(value, context);
    }
}
