/**
 * Base of every error `pg-dolly-schema` throws.
 */
// eslint-disable-next-line unicorn/custom-error-definition
export abstract class PgDollySchemaError extends Error {}

/**
 * The migrate command succeeded, but left the database empty. It may have migrated another database, e.g. by reading
 * a variable other than `DATABASE_URL`.
 */
export class PgDollySchemaEmptyError extends PgDollySchemaError {
    public readonly command: string;
    public constructor(command: string) {
        super(
            `Migrate command left the database empty: ${command}. It must migrate the database in DATABASE_URL.`
        );
        this.name = 'PgDollySchemaEmptyError';
        this.command = command;
    }
}

/**
 * The migrate command failed. Its database is kept, to inspect.
 */
export class PgDollySchemaMigrateError extends PgDollySchemaError {
    public readonly command: string;
    public readonly exitCode: number | null;
    public readonly database: string;
    public constructor(command: string, exitCode: number | null, database: string) {
        super(
            `Migrate command failed (exit code ${exitCode ?? 'none'}): ${command}. Its database "${database}" is kept, to inspect.`
        );
        this.name = 'PgDollySchemaMigrateError';
        this.command = command;
        this.exitCode = exitCode;
        this.database = database;
    }
}
