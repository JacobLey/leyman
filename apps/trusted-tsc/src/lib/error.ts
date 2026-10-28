/**
 * Why `tsc` wasn't run: a content mapper isn't trusted, can't be sandboxed, or the project can't be read.
 */
export class TrustedTscError extends Error {
    public override readonly name = 'TrustedTscError';
}
