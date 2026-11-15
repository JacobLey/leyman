import type { Pool } from 'pg';

/**
 * A pending outbox row, claimed by one relay until its lease runs out.
 */
export interface ClaimedRow {
    readonly id: string;
    readonly source: string;
    readonly detailType: string;
    /**
     * What `enqueue` stored, or anything another writer put in the `jsonb` column.
     */
    readonly detail: unknown;
    /**
     * Claims so far, this one included.
     */
    readonly attempts: number;
}

/**
 * Claims up to `limit` pending rows for `leaseMs`, in a statement of its own (autocommit). No transaction stays open
 * while they're sent: `SKIP LOCKED` only keeps concurrent claimers apart for the moment the claim takes, and the
 * lease (`available_at`) keeps the rows from being claimed again until it runs out. A relay that dies mid-send
 * leaves its rows to come back when the lease expires.
 *
 * Rows are taken in id order but nothing is promised about delivery order: identities commit out of order, and
 * retries reorder anyway.
 *
 * @param pool - Pool to run the claim on
 * @param options - How many rows, and for how long
 * @returns Claimed rows
 */
export const claim = async (
    pool: Pool,
    { limit, leaseMs }: { readonly limit: number; readonly leaseMs: number }
): Promise<ClaimedRow[]> => {
    const { rows } = await pool.query<ClaimedRow>(
        `UPDATE outbox SET available_at = now() + $2 * interval '1 millisecond', attempts = attempts + 1
        WHERE id IN (
            SELECT id FROM outbox
            WHERE sent_at IS NULL AND failed_at IS NULL AND available_at <= now()
            ORDER BY id LIMIT $1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING id, source, detail_type AS "detailType", detail, attempts`,
        [limit, leaseMs]
    );
    return rows;
};

/**
 * Marks rows sent. Rows stay, for inspection, until a purge (not built here) deletes old ones.
 *
 * @param pool - Pool to run on
 * @param ids - Rows EventBridge accepted
 */
export const markSent = async (pool: Pool, ids: readonly string[]): Promise<void> => {
    await pool.query(
        'UPDATE outbox SET sent_at = now(), last_error = NULL WHERE id = ANY($1::bigint[])',
        [ids]
    );
};

/**
 * A row EventBridge refused, and its error code.
 */
export interface Failure {
    readonly id: string;
    readonly code: string;
}

/**
 * Parks rows: they are never sent, and wait for a person to fix and requeue them.
 *
 * @param pool - Pool to run on
 * @param failures - Rows and why
 */
export const park = async (pool: Pool, failures: readonly Failure[]): Promise<void> => {
    await pool.query(
        `UPDATE outbox SET failed_at = now(), last_error = failure.code
        FROM unnest($1::bigint[], $2::text[]) AS failure (id, code)
        WHERE outbox.id = failure.id AND outbox.sent_at IS NULL`,
        [failures.map(({ id }) => id), failures.map(({ code }) => code)]
    );
};

/**
 * Makes rows available again after a delay each, replacing their lease.
 *
 * @param pool - Pool to run on
 * @param retries - Rows, why, and how long to wait
 */
export const retryLater = async (
    pool: Pool,
    retries: readonly (Failure & { readonly delayMs: number })[]
): Promise<void> => {
    await pool.query(
        `UPDATE outbox SET available_at = now() + retry.delay_ms * interval '1 millisecond', last_error = retry.code
        FROM unnest($1::bigint[], $2::text[], $3::float8[]) AS retry (id, code, delay_ms)
        WHERE outbox.id = retry.id AND outbox.sent_at IS NULL`,
        [
            retries.map(({ id }) => id),
            retries.map(({ code }) => code),
            retries.map(({ delayMs }) => delayMs),
        ]
    );
};
