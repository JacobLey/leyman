import type { NotesHandlers } from '@leyman/demo-openapi-server';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { NotesClient } from '@leyman/demo-openapi-client';
import {
    appConfigId,
    databaseId,
    drizzleHandlers,
    handlersId,
    idempotencyKeysId,
    idempotencyProblem,
    notes,
    notesAppId,
    notesModule,
    staticTokensBinding,
} from '@leyman/demo-openapi-server';
import { expect } from '@leyman/expect';
import { bind, createContainer } from 'haywire';
import { IdempotencyKeys } from 'idempotency-keys';
import { PostgresStore } from 'idempotency-keys/postgres';
import { suite } from 'mocha-chain';
import { withDatabase } from '#test/helpers/database.js';
import { implementations } from '#test/helpers/implementations.js';
import { postNote } from '#test/helpers/post.js';
import { listen } from '#test/helpers/serve.js';
import { expectStatus } from '#test/helpers/status.js';

const token = 'secret-token';
// Another user's
const otherToken = 'other-token';
const tokens = [
    { token, subject: 'alice' },
    { token: otherToken, subject: 'bob' },
];
const dolly = { title: 'Dolly', body: 'A sheep' };

// Black-box tests, through HTTP alone, so each server is held to the same expectations
for (const implementation of implementations) {
    suite(`Idempotency keys on ${implementation.name}`, () => {
        /**
         * The server on its own database.
         */
        const withServer = withDatabase().beforeEach(async ({ database }) => {
            // The test's own connection, to read rows directly
            const pool = new Pool({ connectionString: database.url, max: 1 });
            const served = await implementation.start({
                databaseUrl: database.url,
                authentication: { tokens },
            });
            return {
                pool,
                served,
                post: async ({
                    key,
                    body = dolly,
                    as = token,
                }: {
                    readonly key?: string;
                    readonly body?: unknown;
                    readonly as?: string;
                }): Promise<Response> => postNote(served.url, { key, body, token: as }),
                client: new NotesClient({ baseUrl: served.url, token }),
                count: async (): Promise<number> => {
                    const { rows } = await pool.query('SELECT * FROM notes');
                    return rows.length;
                },
            };
        });
        withServer.afterEach(async ({ pool, served }) => {
            await served.close();
            await pool.end();
        });

        withServer.test(
            'Adds the note once, and replays it to a retry',
            async ({ post, count }) => {
                const first = await post({ key: 'key-1' });
                const retry = await post({ key: 'key-1' });

                expect(first.status).to.equal(201);
                expect(first.headers.get('idempotent-replayed')).to.equal(null);
                expect(retry.status).to.equal(201);
                expect(retry.headers.get('idempotent-replayed')).to.equal('true');
                expect(retry.headers.get('content-type')).to.equal(
                    first.headers.get('content-type')
                );
                expect(await retry.json()).to.deep.equal(await first.json());
                expect(await count()).to.equal(1);
            }
        );

        withServer.test(
            'Answers a key reused on a different note with a 422',
            async ({ client, count }) => {
                const header = { 'Idempotency-Key': 'key-1' };
                await client.call('createNote', { body: dolly, header });

                const reused = await client.call('createNote', {
                    body: { title: 'Polly', body: 'A sheep' },
                    header,
                });

                expect(reused).to.deep.equal({
                    status: 422,
                    body: {
                        code: 'idempotency_key_reused',
                        message: 'This Idempotency-Key was already used on a different request',
                    },
                });
                expect(await count()).to.equal(1);
            }
        );

        withServer.test("Keeps each caller's keys apart", async ({ post, count }) => {
            const alice = await post({ key: 'key-1' });
            const bob = await post({ key: 'key-1', as: otherToken });

            expect(bob.status).to.equal(201);
            expect(bob.headers.get('idempotent-replayed')).to.equal(null);
            const [aliceNote, bobNote] = (await Promise.all([alice.json(), bob.json()])) as {
                readonly id: string;
            }[];
            expect(bobNote?.id).not.to.equal(aliceNote?.id);
            expect(await count()).to.equal(2);
        });

        withServer.test('Adds a note for every request without a key', async ({ post, count }) => {
            const first = await post({});
            const second = await post({});

            expect(first.status).to.equal(201);
            expect(second.status).to.equal(201);
            expect(second.headers.get('idempotent-replayed')).to.equal(null);
            expect(await count()).to.equal(2);
        });

        withServer.test('Answers a key it cannot read with a 400', async ({ client, count }) => {
            const created = await client.call('createNote', {
                body: dolly,
                header: { 'Idempotency-Key': 'k'.repeat(256) },
            });

            expect(expectStatus(created, 400).body).to.include({ code: 'invalid_request' });
            expect(await count()).to.equal(0);
        });

        withServer.test(
            'Replays a request it rejected, rather than checking it again',
            async ({ post }) => {
                const invalid = { title: '', body: 'A sheep' };

                await post({ key: 'key-1', body: invalid });
                const retry = await post({ key: 'key-1', body: invalid });

                expect(retry.status).to.equal(400);
                expect(retry.headers.get('idempotent-replayed')).to.equal('true');
            }
        );

        withServer.test(
            'Refuses a body larger than any note before keeping its key',
            async ({ post, pool }) => {
                const created = await post({
                    key: 'key-1',
                    body: { title: 'Dolly', body: 'A sheep'.repeat(20_000) },
                });

                expect(created.status).to.equal(413);
                const { rows } = await pool.query('SELECT * FROM idempotency_keys');
                expect(rows).to.deep.equal([]);
            }
        );
    });
}

// Tests of what only the TypeScript server's internals can set up: handlers and stores swapped in through haywire
suite('Idempotency keys on TypeScript alone', () => {
    /**
     * The app on its own database, with bindings swapped in by each test, served on a free port.
     */
    const withApp = withDatabase().beforeEach(async ({ database }) => {
        const pool = new Pool({ connectionString: database.url, max: 4 });
        const db = drizzle({ client: pool });
        const errors: Error[] = [];
        const closing: (() => Promise<void>)[] = [];
        const serveWith = async (
            options: {
                readonly handlers?: Partial<NotesHandlers>;
                readonly keys?: IdempotencyKeys;
            } = {}
        ) => {
            let module = notesModule
                .addBinding(bind(databaseId).withInstance(db))
                .addBinding(staticTokensBinding(tokens))
                .addBinding(
                    bind(appConfigId).withInstance({
                        onError: error => {
                            errors.push(error);
                        },
                    })
                )
                .replaceBinding(
                    bind(handlersId).withInstance({ ...drizzleHandlers(db), ...options.handlers })
                );
            if (options.keys) {
                module = module.replaceBinding(bind(idempotencyKeysId).withInstance(options.keys));
            }
            const served = await listen(createContainer(module).get(notesAppId));
            closing.push(served.close);
            const post = async ({
                key,
                body = dolly,
                as = token,
            }: {
                readonly key?: string;
                readonly body?: unknown;
                readonly as?: string;
            }): Promise<Response> => postNote(served.url, { key, body, token: as });
            return {
                post,
                client: new NotesClient({ baseUrl: served.url, token }),
            };
        };
        /**
         * A `createNote` that waits for `open()` before adding the note, so a duplicate arrives while it runs.
         *
         * @returns The handler, and what lets it go on
         */
        const gated = () => {
            const { promise, resolve } = Promise.withResolvers<void>();
            const { createNote } = drizzleHandlers(db);
            const { promise: started, resolve: start } = Promise.withResolvers<void>();
            return {
                started,
                open: resolve,
                handlers: {
                    createNote: async (...args: Parameters<NotesHandlers['createNote']>) => {
                        start();
                        await promise;
                        return createNote(...args);
                    },
                } satisfies Partial<NotesHandlers>,
            };
        };
        const count = async (): Promise<number> => {
            const rows = await db.select().from(notes);
            return rows.length;
        };
        return { pool, db, errors, closing, serveWith, gated, count };
    });
    withApp.afterEach(async ({ pool, closing }) => {
        await Promise.all(closing.map(async close => close()));
        await pool.end();
    });

    withApp.test(
        'Holds a duplicate until the first is done, then replays it',
        async ({ serveWith, gated, count, pool }) => {
            const gate = gated();
            const store = new PostgresStore({ client: pool });
            const { promise: held, resolve: hold } = Promise.withResolvers<void>();
            const { post } = await serveWith({
                handlers: gate.handlers,
                keys: new IdempotencyKeys({
                    // The store, telling the test when the duplicate found the key held
                    store: {
                        claim: async params => {
                            const claimed = await store.claim(params);
                            if (claimed.state === 'running') {
                                hold();
                            }
                            return claimed;
                        },
                        complete: async (...args) => store.complete(...args),
                        release: async (...args) => store.release(...args),
                    },
                    problem: idempotencyProblem,
                }),
            });

            const first = post({ key: 'key-1' });
            await gate.started;
            const duplicate = post({ key: 'key-1' });
            await held;
            gate.open();

            const [ran, waited] = await Promise.all([first, duplicate]);
            expect(ran.status).to.equal(201);
            expect(waited.status).to.equal(201);
            expect(waited.headers.get('idempotent-replayed')).to.equal('true');
            expect(await waited.json()).to.deep.equal(await ran.json());
            expect(await count()).to.equal(1);
        }
    );

    withApp.test(
        'Answers a duplicate with a 409 when the first outlasts the wait',
        async ({ serveWith, gated, pool }) => {
            const gate = gated();
            const { client } = await serveWith({
                handlers: gate.handlers,
                keys: new IdempotencyKeys({
                    store: new PostgresStore({ client: pool }),
                    problem: idempotencyProblem,
                    waitMs: 0,
                }),
            });
            const header = { 'Idempotency-Key': 'key-1' };

            const first = client.call('createNote', { body: dolly, header });
            await gate.started;
            const duplicate = await client.call('createNote', { body: dolly, header });
            gate.open();

            expect(duplicate).to.deep.equal({
                status: 409,
                body: {
                    code: 'idempotency_key_in_use',
                    message: 'A request with this Idempotency-Key is still running: retry later',
                },
            });
            const ran = await first;
            expect(ran.status).to.equal(201);
        }
    );

    withApp.test(
        'Sends the response, and reports a key it could not store it under',
        async ({ serveWith, db, errors, count }) => {
            const { createNote } = drizzleHandlers(db);
            const { post } = await serveWith({
                handlers: {
                    createNote: async (...args) => {
                        await db.execute(sql`DROP TABLE idempotency_keys`);
                        return createNote(...args);
                    },
                },
            });

            const created = await post({ key: 'key-1' });

            expect(created.status).to.equal(201);
            expect(await count()).to.equal(1);
            expect(errors).to.have.lengthOf(1);
            expect(errors[0]?.message).to.include('idempotency_keys');
        }
    );
});
