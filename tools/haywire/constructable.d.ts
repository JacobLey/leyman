/**
 * Most generic class possible.
 * Used by types to help determine if a method is a class constructor.
 *
 * Hand-written declaration (rather than declared in `src/`) because TypeScript strips the
 * parameters of private constructors when emitting declarations. The emitted
 * `private constructor();` would reject classes whose private constructor takes arguments.
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export declare abstract class Constructable {
    private constructor(...args: unknown[]);
}
