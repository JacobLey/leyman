/**
 * Directly re-export method.
 *
 * In non patchable environments (`--conditions!=patchable`) this method is
 * returned instead of the actual patch method.
 *
 * @param x - method
 * @returns input unchanged
 */
export const patch = <T>(x: T): T => x;
