import type { ClaimParams, ClaimResult, IdempotencyStore, StoredResponse } from './attempt.js';
import { fromHex, toHex } from './encoding.js';
import { quoteIdentifier } from './identifier.js';

/**
 * The one method needed from a Postgres client. A `pg` `Pool` or `Client` fits as is. `bytea` columns must come
 * back as bytes and `jsonb` parsed, as `pg` returns them.
 */
export interface PostgresQueryable {
    query: (
        text: string,
        values: readonly unknown[]
    ) => Promise<{ readonly rows: readonly object[]; readonly rowCount: number | null }>;
}

export interface PostgresStoreOptions {
    /**
     * Client to run the statements on, usually a pool. The store never closes it.
     */
    readonly client: PostgresQueryable;
    /**
     * Name of the table, created with {@link createTableSql}. Defaults to `idempotency_keys`. One identifier, quoted, so
     * case-exact, of at most 63 bytes. Not schema-qualified: set the client's `search_path` for another schema.
     */
    readonly table?: string;
}

const defaultTable = 'idempotency_keys';

interface RecordRow {
    readonly fingerprint: Uint8Array;
    readonly status: number | null;
    readonly headers: readonly (readonly [string, string])[] | null;
    readonly body: Uint8Array | null;
}

/**
 * The table every implementation shares, as in the spec.
 *
 * @param table - Name of the table, `idempotency_keys` by default
 * @returns `CREATE TABLE` statement
 */
export const createTableSql = (
    table = defaultTable
): string => `CREATE TABLE ${quoteIdentifier('table', table)} (
    identity bytea PRIMARY KEY,
    fingerprint bytea NOT NULL,
    token text,
    lease_expires_at timestamptz,
    expires_at timestamptz NOT NULL,
    status smallint,
    headers jsonb,
    body bytea
);
`;

/**
 * The strict store: a claim is a row written in a transaction, so it is exclusive and durable. Every time is
 * `clock_timestamp()`, the statement's own, never `now()`, which a client inside a long transaction would see frozen
 * at its start. Postgres never
 * deletes expired rows on its own: run {@link PostgresStore.deleteExpired} from a scheduled job, or leave them to be
 * overwritten by the next claim.
 */
export class PostgresStore implements IdempotencyStore {
    readonly #client: PostgresQueryable;
    readonly #claimSql: string;
    readonly #readSql: string;
    readonly #completeSql: string;
    readonly #releaseSql: string;
    readonly #expiredSql: string;

    public constructor({ client, table = defaultTable }: PostgresStoreOptions) {
        this.#client = client;
        const name = quoteIdentifier('table', table);
        this.#claimSql = `INSERT INTO ${name} (identity, fingerprint, token, lease_expires_at, expires_at)
VALUES ($1, $2, $3, clock_timestamp() + $4 * interval '1 millisecond', clock_timestamp() + $5 * interval '1 millisecond')
ON CONFLICT (identity) DO UPDATE
    SET fingerprint = excluded.fingerprint, token = excluded.token,
        lease_expires_at = excluded.lease_expires_at, expires_at = excluded.expires_at,
        status = NULL, headers = NULL, body = NULL
    WHERE ${name}.expires_at <= clock_timestamp()
       OR (${name}.lease_expires_at <= clock_timestamp() AND ${name}.fingerprint = excluded.fingerprint)
RETURNING token`;
        this.#readSql = `SELECT fingerprint, status, headers, body FROM ${name} WHERE identity = $1 AND expires_at > clock_timestamp()`;
        this.#completeSql = `UPDATE ${name} SET status = $3, headers = $4, body = $5, token = NULL, lease_expires_at = NULL
WHERE identity = $1 AND token = $2 AND expires_at > clock_timestamp()`;
        this.#releaseSql = `DELETE FROM ${name} WHERE identity = $1 AND token = $2`;
        this.#expiredSql = `DELETE FROM ${name} WHERE expires_at <= clock_timestamp()`;
    }

    public async claim({
        identity,
        fingerprint,
        token,
        leaseMs,
        ttlMs,
    }: ClaimParams): Promise<ClaimResult> {
        const id = fromHex(identity);
        for (;;) {
            const claimed = await this.#client.query(this.#claimSql, [
                id,
                fromHex(fingerprint),
                token,
                leaseMs,
                ttlMs,
            ]);
            if (claimed.rows.length > 0) {
                return { state: 'claimed' };
            }
            const { rows } = await this.#client.query(this.#readSql, [id]);
            const [row] = rows as readonly RecordRow[];
            // Released or expired between the two statements: claim again
            if (row) {
                return row.status === null
                    ? { state: 'running', fingerprint: toHex(row.fingerprint) }
                    : {
                          state: 'completed',
                          fingerprint: toHex(row.fingerprint),
                          response: { status: row.status, headers: row.headers!, body: row.body! },
                      };
            }
        }
    }

    public async complete(
        identity: string,
        token: string,
        response: StoredResponse
    ): Promise<boolean> {
        const { rowCount } = await this.#client.query(this.#completeSql, [
            fromHex(identity),
            token,
            response.status,
            JSON.stringify(response.headers),
            response.body,
        ]);
        return rowCount === 1;
    }

    public async release(identity: string, token: string): Promise<boolean> {
        const { rowCount } = await this.#client.query(this.#releaseSql, [fromHex(identity), token]);
        return rowCount === 1;
    }

    /**
     * Deletes every expired row, for a scheduled job.
     *
     * @returns How many rows it deleted
     */
    public async deleteExpired(): Promise<number> {
        const { rowCount } = await this.#client.query(this.#expiredSql, []);
        // `pg` gives `null` only for statements that touch no rows by nature, never a `DELETE`
        return Number(rowCount);
    }
}
