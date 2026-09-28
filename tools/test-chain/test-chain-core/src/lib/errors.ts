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
