/**
 * Error thrown when the called "main" method has not actually been implemented.
 */
export class MainNotImplementedError extends Error {
    public override readonly name = 'MainNotImplementedError';
    public constructor(isInstance: boolean) {
        super(`"main" not implemented on EntryScript child ${isInstance ? 'instance' : 'class'}.`);
    }
}
