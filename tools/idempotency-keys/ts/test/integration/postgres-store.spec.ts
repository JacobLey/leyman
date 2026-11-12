import type { PostgresQueryable } from 'idempotency-keys/postgres';
import { readFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { expect } from '@leyman/expect';
import { computeIdentity, IdempotencyKeysOptionError } from 'idempotency-keys';
import { createTableSql, PostgresStore } from 'idempotency-keys/postgres';
import { suite, test } from 'mocha-chain';
import { withDatabase } from '../helpers/database.js';

const fingerprint = 'f'.repeat(64);
const otherFingerprint = 'e'.repeat(64);
const response = {
    status: 201,
    headers: [
        ['content-type', 'application/octet-stream'],
        ['set-cookie', 'a=1'],
        ['set-cookie', 'b=2'],
    ],
    body: Uint8Array.from([0, 255, 128, 10]),
} as const;

const longTimes = { leaseMs: 60_000, ttlMs: 86_400_000 };

const claim = async (
    store: PostgresStore,
    identity: string,
    token: string,
    times: { leaseMs: number; ttlMs: number } = longTimes
) => store.claim({ identity, fingerprint, token, ...times });

suite('PostgresStore', () => {
    test('Creates the table of the spec by default', async () => {
        const spec = await readFile(new URL('../../../SPEC.md', import.meta.url), 'utf8');
        const ddl = /```sql\n(?<ddl>CREATE TABLE[^`]+)```/v.exec(spec)!.groups!.ddl!;
        expect(createTableSql().replace('"idempotency_keys"', 'idempotency_keys')).to.equal(ddl);
    });

    test('Rejects an empty table name', () => {
        expect(() => createTableSql('')).to.throw(IdempotencyKeysOptionError);
    });

    test('Rejects a table name over 63 bytes, which Postgres would cut short', () => {
        expect(() => createTableSql('é'.repeat(32))).to.throw(IdempotencyKeysOptionError);
    });

    test('Accepts a table name of 63 bytes', () => {
        expect(createTableSql('k'.repeat(63))).to.include(`"${'k'.repeat(63)}"`);
    });

    const withStore = withDatabase().beforeEach(({ pool }) => ({
        store: new PostgresStore({ client: pool }),
        identity: 'a'.repeat(64),
    }));

    withStore.test(
        'Writes a running row, then a completed one, as the spec describes',
        async ({ pool, store }) => {
            const identity = await computeIdentity({ scope: 's', key: 'k' });
            await claim(store, identity, '1'.repeat(32));
            const running = await pool.query(
                `SELECT encode(identity, 'hex') AS identity, encode(fingerprint, 'hex') AS fingerprint, token,
                lease_expires_at > now() AS leased, expires_at > lease_expires_at AS expires_later, status
            FROM idempotency_keys`
            );
            expect(running.rows).to.deep.equal([
                {
                    identity,
                    fingerprint,
                    token: '1'.repeat(32),
                    leased: true,
                    expires_later: true,
                    status: null,
                },
            ]);

            await store.complete(identity, '1'.repeat(32), response);
            const completed = await pool.query(
                'SELECT token, lease_expires_at, status, headers, body FROM idempotency_keys'
            );
            expect(completed.rows).to.deep.equal([
                {
                    token: null,
                    lease_expires_at: null,
                    status: 201,
                    headers: response.headers,
                    body: Buffer.from(response.body),
                },
            ]);
        }
    );

    withStore.test('Replays a binary body byte for byte', async ({ store, identity }) => {
        await claim(store, identity, '1'.repeat(32));
        await store.complete(identity, '1'.repeat(32), response);
        const result = await claim(store, identity, '2'.repeat(32));
        expect(result).to.deep.include({ state: 'completed', fingerprint });
        expect(result)
            .to.have.nested.property('response.body')
            .that.deep.equals(Buffer.from(response.body));
    });

    withStore.test(
        'Keeps a running row of another fingerprint whose lease ran out',
        async ({ store, identity }) => {
            await claim(store, identity, '1'.repeat(32), { leaseMs: 1, ttlMs: 60_000 });
            await setTimeout(10);
            const result = await store.claim({
                identity,
                fingerprint: otherFingerprint,
                token: '2'.repeat(32),
                leaseMs: 60_000,
                ttlMs: 86_400_000,
            });
            expect(result).to.deep.equal({ state: 'running', fingerprint });
        }
    );

    withStore.test(
        'Claims again when the row is released between its two statements',
        async ({ pool, identity }) => {
            let isFirstRead = true;
            // Releases the row just before the store reads it, as another request might
            const client: PostgresQueryable = {
                query: async (text, values) => {
                    if (isFirstRead && text.startsWith('SELECT')) {
                        isFirstRead = false;
                        await pool.query('DELETE FROM idempotency_keys');
                    }
                    return pool.query(text, [...values]);
                },
            };
            const store = new PostgresStore({ client });
            await claim(store, identity, '1'.repeat(32));
            expect(await claim(store, identity, '2'.repeat(32))).to.deep.equal({
                state: 'claimed',
            });
        }
    );

    withStore.test('Deletes only expired rows', async ({ store }) => {
        await claim(store, '1'.repeat(64), '1'.repeat(32), { leaseMs: 1, ttlMs: 2 });
        await claim(store, '2'.repeat(64), '2'.repeat(32));
        await setTimeout(10);
        expect(await store.deleteExpired()).to.equal(1);
        expect(await claim(store, '2'.repeat(64), '3'.repeat(32))).to.deep.equal({
            state: 'running',
            fingerprint,
        });
    });

    withStore.test('Deletes nothing when nothing expired', async ({ store }) => {
        expect(await store.deleteExpired()).to.equal(0);
    });

    withStore.test('Uses a table of another name, quoted as given', async ({ pool, identity }) => {
        const table = 'Idempotency "Keys"';
        await pool.query(createTableSql(table));
        const store = new PostgresStore({ client: pool, table });
        await claim(store, identity, '1'.repeat(32));
        expect(await store.complete(identity, '1'.repeat(32), response)).to.equal(true);
        const { rows } = await pool.query(
            'SELECT count(*)::int AS count FROM "Idempotency ""Keys"""'
        );
        expect(rows).to.deep.equal([{ count: 1 }]);
    });

    withStore.test('Stores nothing once the key expired', async ({ store, identity }) => {
        await claim(store, identity, '1'.repeat(32), { leaseMs: 1, ttlMs: 2 });
        await setTimeout(10);
        expect(await store.complete(identity, '1'.repeat(32), response)).to.equal(false);
    });

    withStore.test('Releases nothing once the key expired', async ({ store, identity }) => {
        await claim(store, identity, '1'.repeat(32), { leaseMs: 1, ttlMs: 2 });
        await setTimeout(10);
        expect(await store.release(identity, '1'.repeat(32))).to.equal(false);
    });

    withStore.test('Completes and releases only with the token', async ({ store, identity }) => {
        await claim(store, identity, '1'.repeat(32));
        expect(await store.complete(identity, '2'.repeat(32), response)).to.equal(false);
        expect(await store.release(identity, '2'.repeat(32))).to.equal(false);
        expect(await store.release(identity, '1'.repeat(32))).to.equal(true);
    });

    test('Rejects an empty table name when constructed', () => {
        expect(
            () =>
                new PostgresStore({
                    client: { query: async () => ({ rows: [], rowCount: 0 }) },
                    table: '',
                })
        ).to.throw(IdempotencyKeysOptionError);
    });
});
