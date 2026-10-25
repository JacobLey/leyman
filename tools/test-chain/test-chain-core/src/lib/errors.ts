/**
 * Thrown when a chained hook executes before the hook it is chained from.
 *
 * Context can only flow forward, so hooks must execute in the order they are registered.
 * Frameworks that reverse (or parallelize) hook execution cannot support chained context.
 */
export class HookOrderError extends Error {
    public constructor() {
        super(
            'Chained hook executed before the hook it is chained from. Ensure the test framework runs hooks in the order they are registered.'
        );
        this.name = 'HookOrderError';
    }
}

/**
 * Thrown when a hook returns a value other than a plain object, `undefined` or `null`.
 *
 * Only a plain object's own properties are merged into the context, so the methods of a class instance (or the
 * items of an array) would be typed on the context but missing from it.
 */
export class HookContextError extends Error {
    public constructor(received: string, options?: ErrorOptions) {
        super(
            `Hook returned ${received}, but must return a plain object, undefined or null. Only a plain object's own properties are merged into the context, so wrap the value in one, such as \`return { client }\`.`,
            options
        );
        this.name = 'HookContextError';
    }
}
