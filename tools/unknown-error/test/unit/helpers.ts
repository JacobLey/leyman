const traps = [
    'apply',
    'construct',
    'defineProperty',
    'deleteProperty',
    'get',
    'getOwnPropertyDescriptor',
    'getPrototypeOf',
    'has',
    'isExtensible',
    'ownKeys',
    'preventExtensions',
    'set',
    'setPrototypeOf',
] as const;

/**
 * A Proxy that throws from every trap, the worst value a `catch` can receive.
 *
 * @returns a new hostile Proxy
 */
export const hostileProxy = (): object =>
    new Proxy(
        {},
        Object.fromEntries(
            traps.map(trap => [
                trap,
                () => {
                    throw new Error(`hostile ${trap}`);
                },
            ])
        )
    );

/**
 * An array Proxy that has been revoked, so even `Array.isArray` throws on it.
 *
 * @returns a revoked Proxy
 */
export const revokedArray = (): unknown[] => {
    const { proxy, revoke } = Proxy.revocable<unknown[]>([], {});
    revoke();
    return proxy;
};

/**
 * Replaces an error's stack, so tests don't depend on real stack frames.
 *
 * @param error - error to change
 * @param stack - new stack
 * @returns the same error
 */
export const withStack = <E extends Error>(error: E, stack: string | undefined): E =>
    Object.defineProperty(error, 'stack', { value: stack });

const originalDescriptor = Object.getOwnPropertyDescriptor(Error, 'isError');

/**
 * Removes `Error.isError`, as in Chrome before 134, Firefox before 138, Safari before 18.4, until `restoreIsError` is called.
 */
export const removeIsError = (): void => {
    Reflect.deleteProperty(Error, 'isError');
};

/**
 * Puts back the `Error.isError` that `removeIsError` removed.
 */
export const restoreIsError = (): void => {
    Object.defineProperty(Error, 'isError', originalDescriptor ?? {});
};
