/**
 * Base of every error `pg-dolly` throws.
 */
export abstract class PgDollyError extends Error {}

/**
 * Neither the `url` option nor `DATABASE_URL` says which server to connect to.
 */
export class PgDollyMissingUrlError extends PgDollyError {
    public constructor() {
        super('No Postgres server to connect to: set DATABASE_URL, or pass the `url` option');
        this.name = 'PgDollyMissingUrlError';
    }
}

/**
 * The prefix can't safely start database names.
 */
export class PgDollyPrefixError extends PgDollyError {
    public readonly prefix: string;
    public constructor(prefix: string) {
        super(
            `Invalid prefix ${JSON.stringify(prefix)}: use 1-20 lowercase letters, digits and underscores, starting with a letter`
        );
        this.name = 'PgDollyPrefixError';
        this.prefix = prefix;
    }
}

/**
 * `retainMs` isn't a finite number of at least 0. Not a number would never drop anything, and a negative number would
 * drop kept clones while someone may be looking at them.
 */
export class PgDollyRetainMsError extends PgDollyError {
    public readonly retainMs: number;
    public constructor(retainMs: number) {
        super(`Invalid retainMs ${retainMs}: use a finite number of milliseconds of at least 0`);
        this.name = 'PgDollyRetainMsError';
        this.retainMs = retainMs;
    }
}

/**
 * The `PgDolly` was used after `close()`.
 */
export class PgDollyClosedError extends PgDollyError {
    public constructor() {
        super('PgDolly is closed');
        this.name = 'PgDollyClosedError';
    }
}
