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
 * The `PgDolly` was used after `close()`.
 */
export class PgDollyClosedError extends PgDollyError {
    public constructor() {
        super('PgDolly is closed');
        this.name = 'PgDollyClosedError';
    }
}
