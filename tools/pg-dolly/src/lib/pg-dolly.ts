import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { PgDollyClosedError, PgDollyMissingUrlError, PgDollyPrefixError } from './errors.js';

export interface PgDollyOptions {
    /**
     * Server to connect to, as a `postgres://` URL. Databases are created on it, and the URLs returned for them
     * differ from it only in the database name.
     *
     * @default process.env.DATABASE_URL
     */
    readonly url?: string | undefined;
    /**
     * Start of every database name `pg-dolly` creates. 1-20 lowercase letters, digits and underscores, starting with
     * a letter.
     *
     * @default 'pg_dolly'
     */
    readonly prefix?: string | undefined;
    /**
     * `TimeZone` setting of every clone, as a clone doesn't inherit the template's `ALTER DATABASE` settings.
     *
     * @default 'UTC'
     */
    readonly timeZone?: string | undefined;
    /**
     * How long, in milliseconds, a template no run has used is kept, and so is a database kept from a failed test.
     *
     * @default 86_400_000 (a day)
     */
    readonly retainMs?: number | undefined;
}

/**
 * A database to clone from, built from a schema's SQL.
 */
export interface DollyTemplate {
    /**
     * Database name, from the hash of the SQL.
     */
    readonly name: string;
    /**
     * Hash of the SQL the template was built from.
     */
    readonly hash: string;
    /**
     * Creates a fresh database from the template, for one test.
     */
    readonly clone: () => Promise<DollyDatabase>;
}

/**
 * A database of its own, for one test.
 */
export interface DollyDatabase {
    /**
     * Database name.
     */
    readonly name: string;
    /**
     * Connection URL: the server's URL, with this database's name.
     */
    readonly url: string;
    /**
     * Keeps the database when `close()` drops the rest, to inspect after a failed test, and prints its name.
     * A later run drops it once `retainMs` has passed.
     */
    readonly keep: () => void;
}

/**
 * Written as the comment of every database `pg-dolly` creates. It only drops databases with its prefix _and_ this
 * marker, so it never touches a database it didn't make.
 */
type Marker =
    | {
          readonly pgDolly: 1;
          readonly prefix: string;
          /**
           * Being built, or a clone. Belongs to the run until it ends.
           */
          readonly kind: 'build' | 'clone';
          readonly run: string;
          /**
           * When a failed test's clone was kept.
           */
          readonly keptAt?: number;
      }
    | {
          readonly pgDolly: 1;
          readonly prefix: string;
          readonly kind: 'template';
          /**
           * When a run last used it.
           */
          readonly usedAt: number;
      };

interface DatabaseRow {
    readonly datname: string;
    readonly comment: string | null;
}

interface DatabaseState {
    readonly datistemplate: boolean;
    readonly datconnlimit: number;
    readonly comment: string | null;
}

/**
 * An advisory lock, as its purpose and what it locks.
 */
type Lock = readonly [purpose: string, name: string];

interface CloneState {
    readonly name: string;
    kept: boolean;
}

const prefixPattern = /^[a-z][\d_a-z]{0,19}$/u;
// A day
const defaultRetainMs = 86_400_000;
/**
 * Hex characters of the hash in a template's name: 128 bits.
 */
const hashLength = 32;
/**
 * Hex characters of a run's id: 48 bits, plenty for the runs alive at once.
 */
const runLength = 12;
/**
 * Changing how templates are built changes every hash, so no template built the old way is reused.
 */
const hashVersion = 'pg-dolly:1';
/**
 * `datconnlimit` of a database a `DROP DATABASE` was interrupted in the middle of.
 */
const invalidConnLimit = -2;

/**
 * Hash of a schema's SQL, which names its template.
 *
 * @param sql - Schema
 * @returns Hex hash
 */
const hashSql = (sql: string): string =>
    createHash('sha256')
        .update(hashVersion)
        .update('\0')
        .update(sql)
        .digest('hex')
        .slice(0, hashLength);

/**
 * Reads the marker in a database's comment.
 *
 * @param comment - Database comment
 * @param prefix - Prefix the marker must have
 * @returns The marker in it, if it is one with that prefix
 */
const parseMarker = (comment: string | null, prefix: string): Marker | null => {
    if (comment === null) {
        return null;
    }
    try {
        const marker = JSON.parse(comment) as Partial<Marker> | null;
        return marker?.pgDolly === 1 && marker.prefix === prefix ? (marker as Marker) : null;
    } catch {
        return null;
    }
};

/**
 * Whether a database is left over, and the lock that shows nothing uses it.
 *
 * @param name - Database name
 * @param marker - Its marker
 * @param expired - Kept from before this time is too long
 * @returns The lock to drop it under, or `null` to keep it
 */
const leftoverLock = (name: string, marker: Marker, expired: number): Lock | null => {
    if (marker.kind === 'template') {
        // Every run using the template holds its use lock, shared
        return marker.usedAt <= expired ? ['use', name] : null;
    }
    if (marker.keptAt !== undefined && marker.keptAt > expired) {
        return null;
    }
    // The run's connection holds the lock until it ends, so getting it means the run is gone. Never this run's own
    // lock, which it would get again: sweeping happens before it makes anything.
    return ['run', marker.run];
};

/**
 * A fresh Postgres database per test, cloned from a template built once from the schema's SQL.
 *
 * Holds one admin connection to create and drop databases. Tests connect to their own databases themselves, with the
 * URLs it returns.
 */
export class PgDolly {
    readonly #client: pg.Client;
    readonly #url: string;
    readonly #prefix: string;
    readonly #timeZone: string;
    readonly #retainMs: number;
    /**
     * Identifies this run in the markers. The admin connection holds an advisory lock on it until the run ends, so
     * another run can tell whether its databases are still in use, or left behind by a crash.
     */
    readonly #run = randomUUID().replaceAll('-', '').slice(0, runLength);
    readonly #templates = new Map<string, Promise<DollyTemplate>>();
    readonly #clones: CloneState[] = [];
    /**
     * Templates are built one at a time. Two builds interleaving their queries on the one connection could each hold
     * one build lock while waiting on the other's, which another run might hold.
     */
    #building: Promise<unknown> = Promise.resolve();
    /**
     * The admin connection runs one query at a time. `pg` queues concurrent queries itself, but deprecates it.
     */
    #queue: Promise<void> = Promise.resolve();
    #count = 0;
    #closed: Promise<void> | null = null;

    private constructor(
        client: pg.Client,
        url: string,
        options: { readonly prefix: string; readonly timeZone: string; readonly retainMs: number }
    ) {
        this.#client = client;
        this.#url = url;
        this.#prefix = options.prefix;
        this.#timeZone = options.timeZone;
        this.#retainMs = options.retainMs;
    }

    /**
     * Connects to the server, and drops what earlier runs left behind: databases of runs that crashed, templates no
     * run has used for `retainMs`, and databases kept that long.
     *
     * @param options - Which server, and how to name and set up databases on it
     * @returns A connected `PgDolly`
     * @throws {PgDollyMissingUrlError} Without `url` or `DATABASE_URL`
     * @throws {PgDollyPrefixError} When the prefix can't start a database name
     */
    public static async connect(options: PgDollyOptions = {}): Promise<PgDolly> {
        // eslint-disable-next-line n/no-process-env -- `DATABASE_URL` is the one input, by design
        const url = options.url ?? process.env.DATABASE_URL;
        if (!url) {
            throw new PgDollyMissingUrlError();
        }
        const prefix = options.prefix ?? 'pg_dolly';
        if (!prefixPattern.test(prefix)) {
            throw new PgDollyPrefixError(prefix);
        }

        const client = new pg.Client({ connectionString: url });
        // Unhandled, a lost connection would crash the process. The next query rejects instead.
        client.on('error', () => {});
        await client.connect();
        const dolly = new PgDolly(client, url, {
            prefix,
            timeZone: options.timeZone ?? 'UTC',
            retainMs: options.retainMs ?? defaultRetainMs,
        });
        try {
            await dolly.#lock('run', dolly.#run);
            await dolly.#sweep();
        } catch (error) {
            // Left open, the connection would keep the process running
            await client.end();
            throw error;
        }
        return dolly;
    }

    /**
     * Gets the template for a schema, building it unless an earlier run already did. Templates are kept between
     * runs, named by the hash of the SQL, so only a changed schema is built again.
     *
     * @param sql - The schema, e.g. a committed `schema.sql`. An empty string gives an empty database.
     * @returns The template, ready to clone
     */
    public async template(sql: string): Promise<DollyTemplate> {
        this.#assertOpen();
        const hash = hashSql(sql);
        let template = this.#templates.get(hash);
        if (!template) {
            template = this.#buildInTurn(sql, hash);
            this.#building = template;
            this.#templates.set(hash, template);
        }
        return template;
    }

    /**
     * Drops this run's databases, except those kept, and closes the connection. Calling it again does nothing.
     *
     * @returns Once closed
     */
    public async close(): Promise<void> {
        this.#closed ??= this.#close();
        return this.#closed;
    }

    async #buildInTurn(sql: string, hash: string): Promise<DollyTemplate> {
        try {
            await this.#building;
        } catch {
            // Another template's failure is reported to whoever asked for it
        }
        try {
            return await this.#template(sql, hash);
        } catch (error) {
            // Built again on the next call
            this.#templates.delete(hash);
            throw error;
        }
    }

    async #close(): Promise<void> {
        const keptAt = Date.now();
        try {
            // Dropped all at once at the end rather than after each test, as each drop forces a checkpoint
            for (const clone of this.#clones) {
                await (clone.kept
                    ? this.#comment(clone.name, {
                          pgDolly: 1,
                          prefix: this.#prefix,
                          kind: 'clone',
                          run: this.#run,
                          keptAt,
                      })
                    : this.#drop(clone.name));
            }
        } finally {
            // Releases the advisory locks too. A clone left behind is dropped by a later run.
            await this.#client.end();
        }
    }

    async #template(sql: string, hash: string): Promise<DollyTemplate> {
        const name = `${this.#prefix}_t_${hash}`;
        // Held until the run ends, so no other run drops the template as unused while this one clones it
        await this.#lockShared('use', name);
        // So two runs never build the same template at once: the second waits, then finds it built
        await this.#lock('build', name);
        try {
            const { rows } = await this.#query<{
                datistemplate: boolean;
                datallowconn: boolean;
            }>('SELECT datistemplate, datallowconn FROM pg_database WHERE datname = $1', [name]);
            const [existing] = rows;
            // Nothing can connect to a template and change it without first allowing connections again. One that
            // allows them may have been changed, so it is never reused.
            const isReusable = existing?.datistemplate === true && !existing.datallowconn;
            if (!isReusable) {
                if (existing) {
                    await this.#drop(name);
                }
                await this.#build(name, sql);
            }
            await this.#comment(name, {
                pgDolly: 1,
                prefix: this.#prefix,
                kind: 'template',
                usedAt: Date.now(),
            });
        } finally {
            await this.#unlock('build', name);
        }
        return { name, hash, clone: async () => this.#clone(name) };
    }

    /**
     * Builds under a temporary name, then renames it (which is atomic), so a template's real name never refers to
     * a half-built one.
     *
     * @param name - Template name
     * @param sql - Schema
     */
    async #build(name: string, sql: string): Promise<void> {
        const building = this.#nextName();
        // From `template0`, so nothing added to `template1` on this server ends up in the template
        await this.#query(`CREATE DATABASE ${this.#identifier(building)} TEMPLATE template0`);
        try {
            await this.#comment(building, {
                pgDolly: 1,
                prefix: this.#prefix,
                kind: 'build',
                run: this.#run,
            });
            const client = new pg.Client({ connectionString: this.#urlOf(building) });
            await client.connect();
            try {
                await client.query(sql);
            } finally {
                await client.end();
            }
            await this.#query(
                `ALTER DATABASE ${this.#identifier(building)} WITH IS_TEMPLATE true ALLOW_CONNECTIONS false`
            );
            await this.#query(
                `ALTER DATABASE ${this.#identifier(building)} RENAME TO ${this.#identifier(name)}`
            );
        } catch (error) {
            await this.#drop(building);
            throw error;
        }
    }

    async #clone(template: string): Promise<DollyDatabase> {
        this.#assertOpen();
        const name = this.#nextName();
        await this.#query(
            `CREATE DATABASE ${this.#identifier(name)} TEMPLATE ${this.#identifier(template)}`
        );
        // A crash before the marker is written leaves a database no run will drop: there is no way to mark it as
        // part of creating it
        const clone: CloneState = { name, kept: false };
        this.#clones.push(clone);
        await this.#comment(name, {
            pgDolly: 1,
            prefix: this.#prefix,
            kind: 'clone',
            run: this.#run,
        });
        await this.#query(
            `ALTER DATABASE ${this.#identifier(name)} SET "TimeZone" TO ${this.#client.escapeLiteral(this.#timeZone)}`
        );
        return {
            name,
            url: this.#urlOf(name),
            keep: () => {
                if (clone.kept) {
                    return;
                }
                clone.kept = true;
                process.stderr.write(`pg-dolly: kept database "${name}" for inspection\n`);
            },
        };
    }

    /**
     * Drops what earlier runs left behind. Only ever databases with this prefix and a marker.
     *
     * Runs connecting at once sweep the same databases, so each drop happens under the lock that shows the
     * database is unused, and only if it is still as listed.
     */
    async #sweep(): Promise<void> {
        const { rows } = await this.#query<DatabaseRow>(
            `SELECT datname, shobj_description(oid, 'pg_database') AS comment
            FROM pg_database WHERE starts_with(datname, $1)`,
            [`${this.#prefix}_`]
        );
        const expired = Date.now() - this.#retainMs;
        for (const { datname, comment } of rows) {
            const marker = parseMarker(comment, this.#prefix);
            const lock = marker && leftoverLock(datname, marker, expired);
            if (!lock || !(await this.#tryLock(...lock))) {
                continue;
            }
            try {
                // Another run may have dropped (or rebuilt) it between the listing and the lock
                const current = await this.#database(datname);
                if (current?.comment === comment) {
                    await this.#drop(datname);
                }
            } finally {
                await this.#unlock(...lock);
            }
        }
    }

    async #database(name: string): Promise<DatabaseState | null> {
        const { rows } = await this.#query<DatabaseState>(
            `SELECT datistemplate, datconnlimit, shobj_description(oid, 'pg_database') AS comment
            FROM pg_database WHERE datname = $1`,
            [name]
        );
        return rows[0] ?? null;
    }

    /**
     * Drops a database, if it still exists. `FORCE` ends any connections left open, e.g. by a crashed test.
     *
     * @param name - Database name
     */
    async #drop(name: string): Promise<void> {
        const database = await this.#database(name);
        if (!database) {
            return;
        }
        // A template can't be dropped. A database left invalid by an interrupted drop can't be altered, only
        // dropped.
        if (database.datistemplate && database.datconnlimit !== invalidConnLimit) {
            await this.#query(`ALTER DATABASE ${this.#identifier(name)} WITH IS_TEMPLATE false`);
        }
        await this.#query(`DROP DATABASE IF EXISTS ${this.#identifier(name)} WITH (FORCE)`);
    }

    async #comment(name: string, marker: Marker): Promise<void> {
        await this.#query(
            `COMMENT ON DATABASE ${this.#identifier(name)} IS ${this.#client.escapeLiteral(JSON.stringify(marker))}`
        );
    }

    async #lock(purpose: string, name: string): Promise<void> {
        await this.#advisory('pg_advisory_lock', purpose, name);
    }

    async #lockShared(purpose: string, name: string): Promise<void> {
        await this.#advisory('pg_advisory_lock_shared', purpose, name);
    }

    async #tryLock(purpose: string, name: string): Promise<boolean> {
        return (await this.#advisory('pg_try_advisory_lock', purpose, name)) === true;
    }

    async #unlock(purpose: string, name: string): Promise<void> {
        await this.#advisory('pg_advisory_unlock', purpose, name);
    }

    /**
     * Advisory locks are keyed by a hash of their purpose and name.
     *
     * @param fn - Advisory lock function
     * @param purpose - What the lock is for
     * @param name - What it locks
     * @returns What the function returned
     */
    async #advisory(fn: string, purpose: string, name: string): Promise<unknown> {
        const { rows } = await this.#query<{ result: unknown }>(
            `SELECT ${fn}(hashtextextended($1, 0)) AS result`,
            [`pg-dolly:${purpose}:${name}`]
        );
        return rows[0]?.result;
    }

    /**
     * Runs a query on the admin connection once every query before it has finished.
     *
     * @param text - SQL
     * @param values - Its parameters
     * @returns The result
     */
    async #query<Row extends pg.QueryResultRow = pg.QueryResultRow>(
        text: string,
        values?: readonly unknown[]
    ): Promise<pg.QueryResult<Row>> {
        const previous = this.#queue;
        const { promise, resolve } = Promise.withResolvers<void>();
        this.#queue = promise;
        try {
            await previous;
            return await this.#client.query<Row>(text, values as unknown[]);
        } finally {
            // Whether it succeeded or failed, the next query runs
            resolve();
        }
    }

    #nextName(): string {
        this.#count++;
        return `${this.#prefix}_${this.#run}_${this.#count}`;
    }

    #identifier(name: string): string {
        return this.#client.escapeIdentifier(name);
    }

    #urlOf(name: string): string {
        const url = new URL(this.#url);
        url.pathname = `/${encodeURIComponent(name)}`;
        return url.href;
    }

    #assertOpen(): void {
        if (this.#closed) {
            throw new PgDollyClosedError();
        }
    }
}
