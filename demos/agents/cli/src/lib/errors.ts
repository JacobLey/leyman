/**
 * A failure the CLI explains in one line on stderr, saying what to do about it. Never a stack trace: whoever runs the
 * CLI (a person or an agent) can act on the message, not on its internals.
 *
 * Exits with 1, unless a subclass says what kind of failure it is.
 */
export class NotesCliError extends Error {
    public readonly exitCode: number = 1;

    public constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'NotesCliError';
    }
}

/**
 * A mistake in the command line: exits with 2, as shells do.
 */
export class NotesCliUsageError extends NotesCliError {
    public override readonly exitCode = 2;

    public constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'NotesCliUsageError';
    }
}

/**
 * Only logging in again can fix it: nobody is logged in, the login expired, or the API or the authorization server
 * refused it. Exits with 3, so an agent can tell its user to log in without parsing the message.
 */
export class NotesCliLoginError extends NotesCliError {
    public override readonly exitCode = 3;

    public constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'NotesCliLoginError';
    }
}
