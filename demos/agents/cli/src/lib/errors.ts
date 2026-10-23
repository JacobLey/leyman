/**
 * A failure the CLI explains in one line on stderr, saying what to do about it, and exits with 1. Never a stack
 * trace: whoever runs the CLI (a person or an agent) can act on the message, not on its internals.
 */
export class NotesCliError extends Error {
    public constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'NotesCliError';
    }
}
