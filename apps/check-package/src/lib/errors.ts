/**
 * Base class of every error `checkPackage` throws, for a single `instanceof` check.
 * A problem with the package itself is never thrown: it is in the result's `problems`.
 */
export abstract class CheckPackageError extends Error {}

/**
 * The workspace root, or the package manager to pack with, can't be found or doesn't fit.
 */
export class CheckPackageRootError extends CheckPackageError {
    public constructor(message: string) {
        super(message);
        this.name = 'CheckPackageRootError';
    }
}

/**
 * The package publishes declarations, but no `tsc` is installed to check them.
 */
export class CheckPackageTscError extends CheckPackageError {
    public constructor(message: string) {
        super(message);
        this.name = 'CheckPackageTscError';
    }
}
