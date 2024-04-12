export const patchKey = Symbol('patchKey');

type AnyFunc = (...args: any[]) => any;
export type PatchableInterface<T extends AnyFunc> = T & {
    [patchKey]: (...args: Parameters<T>) => ReturnType<T>;
};

const patchableMap = new WeakMap<AnyFunc, PatchableInterface<AnyFunc>>();

/**
 * Higher order function that allows patching a method.
 * Only necessary for named function exports (e.g. not attached to a class or object).
 *
 * Because function is exported directly, any usage of "this" must be bound or passed explicitly.
 *
 * Patching a method should only be done in for purposes of testing.
 *
 * Different patches of the same method will yield the same patch! This is important as exporting a patched
 * method can be tricky (typescript reference errors) so "recalculating" the patch works just as well.
 * Useful for cases of patching a third party module that only exports a method.
 *
 * Patches are also idempotent. Re-patching a method (although probably an anti-pattern) will result in the
 * original patched method.
 *
 * @example
 * import { patch, patchKey } from 'named-patch';
 * import { stub } from 'sinon';
 *
 * const originalFunction = (x, y) => x + y;
 * const patched = patch(originalFunction);
 * patched(1,2) === 3; // true
 * stub(patched, patchKey).callsFake(() => 4);
 * patched(1,2) === 4; // true
 *
 * patch(originalFunction) === patched; // true;
 * patch(patched) === patched; // true;
 *
 * @param {Function} fn - Method to patch.
 * @returns {Function} Method with same signature as input, but patchable.
 */

export const patch = <T extends AnyFunc>(fn: T): PatchableInterface<T> => {
    if (patchableMap.has(fn)) {
        return patchableMap.get(fn)! as PatchableInterface<T>;
    }

    if (patchKey in fn) {
        return fn as PatchableInterface<T>;
    }

    const patched = function (
        this: unknown,
        ...args: Parameters<T>
    ): ReturnType<T> {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return patched[patchKey].call(this, ...args);
    } as PatchableInterface<T>;

    Object.defineProperty(patched, patchKey, {
        configurable: true,
        value: fn,
    });
    Object.defineProperty(patched, 'length', { value: fn.length });

    patchableMap.set(fn, patched);

    return patched;
};

/**
 * Fetch the already-cached patched version of a method.
 * Will not perform patching if not already done (throws error in that case).
 *
 * Similarly will throw if method passed is already patched.
 *
 * Useful for test-situations where asserting that a patch is performed is part of the test.
 *
 * @param fn - patchable method
 * @returns patched method
 * @throws when method is either already already patched or unpatched
 */
export const getPatched = <T extends AnyFunc>(fn: T): PatchableInterface<T> => {
    if (patchableMap.has(fn)) {
        return patchableMap.get(fn)! as PatchableInterface<T>;
    }
    throw new Error(`Method is ${patchKey in fn ? 'already ' : 'un-'}patched`);
};
