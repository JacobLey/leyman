import type { NotesHandlers } from '@leyman/demo-openapi-server';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { NotesClient } from '@leyman/demo-openapi-client';
import {
    appConfigId,
    createNotesApp,
    databaseId,
    drizzleHandlers,
    handlersId,
    notes,
    notesAppId,
    notesModule,
    NotesResponseError,
    staticTokensBinding,
} from '@leyman/demo-openapi-server';
import { expect } from '@leyman/expect';
import { bind, createContainer } from 'haywire';
import { suite } from 'mocha-chain';
import { withDatabase } from '../helpers/database.js';
import { listen } from '../helpers/serve.js';

const token = 'secret-token';
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/u;

suite('Notes API', () => {
    /**
     * The app on its own database, served on a free port, with a client that has a token and one that doesn't.
     */
    const withServer = withDatabase().beforeEach(async ({ database }) => {
        // A small pool: every test shares the server's `max_connections`
        const pool = new pg.Pool({ connectionString: database.url, max: 2 });
        const db = drizzle({ client: pool });
        const errors: Error[] = [];
        const served = await listen(
            createNotesApp({
                db,
                tokens: [token],
                onError: error => {
                    errors.push(error);
                },
            })
        );
        return {
            pool,
            db,
            errors,
            served,
            client: new NotesClient({ baseUrl: served.url, token }),
            anonymous: new NotesClient({ baseUrl: served.url }),
        };
    });
    withServer.afterEach(async ({ pool, served }) => {
        await served.close();
        await pool.end();
    });

    suite('createNote', () => {
        withServer.test('Adds a note', async ({ client }) => {
            const created = await client.call('createNote', {
                body: { title: 'Dolly', body: 'A sheep' },
            });

            expect(created.status).to.equal(201);
            expect(created.body).to.include({ title: 'Dolly', body: 'A sheep' });
        });

        withServer.test(
            'Gives the note an id and a time, from the database',
            async ({ client }) => {
                const { body } = await client.call('createNote', {
                    body: { title: 'Dolly', body: 'A sheep' },
                });

                expect(body).to.have.property('id').that.matches(uuid);
                expect(body)
                    .to.have.property('createdAt')
                    .that.matches(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u);
            }
        );

        withServer.test('Requires a token', async ({ anonymous }) => {
            const created = await anonymous.call('createNote', {
                body: { title: 'Dolly', body: 'A sheep' },
            });

            expect(created).to.deep.include({ status: 401 });
        });

        withServer.test('Rejects a wrong token', async ({ served }) => {
            const client = new NotesClient({ baseUrl: served.url, token: 'wrong' });

            const created = await client.call('createNote', {
                body: { title: 'Dolly', body: 'A sheep' },
            });

            expect(created.status).to.equal(401);
        });

        withServer.test('Asks for a bearer token', async ({ served }) => {
            const response = await fetch(`${served.url}/notes`, { method: 'POST' });

            expect(response.status).to.equal(401);
            expect(response.headers.get('www-authenticate')).to.equal('Bearer');
        });

        withServer.test('Checks the token before the body', async ({ anonymous }) => {
            const created = await anonymous.call('createNote', {
                body: { title: '', body: 'A sheep' },
            });

            expect(created.status).to.equal(401);
        });

        withServer.test('Stores nothing for a request it rejects', async ({ anonymous, db }) => {
            await anonymous.call('createNote', { body: { title: 'Dolly', body: 'A sheep' } });

            expect(await db.select().from(notes)).to.deep.equal([]);
        });

        withServer.test('Rejects a body that breaks the schema', async ({ client }) => {
            const created = await client.call('createNote', {
                body: { title: '', body: 'A sheep' },
            });

            expect(created).to.deep.include({ status: 400 });
        });

        withServer.test('Rejects properties the schema does not have', async ({ client }) => {
            const body = { title: 'Dolly', body: 'A sheep', id: 'mine' };

            const created = await client.call('createNote', { body });

            expect(created.status).to.equal(400);
        });

        withServer.test('Rejects a body that is not JSON', async ({ served }) => {
            const response = await fetch(`${served.url}/notes`, {
                method: 'POST',
                headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
                body: '{',
            });

            expect(response.status).to.equal(400);
            expect(await response.json()).to.include({ message: 'body is not valid JSON' });
        });

        withServer.test('Rejects a body of another type', async ({ served }) => {
            const response = await fetch(`${served.url}/notes`, {
                method: 'POST',
                headers: { authorization: `Bearer ${token}` },
                body: Buffer.from('{}'),
            });

            expect(response.status).to.equal(400);
            expect(await response.json()).to.include({ message: 'body must be application/json' });
        });
    });

    suite('getNote', () => {
        withServer.test('Reads a note', async ({ client }) => {
            const { body: note } = await client.call('createNote', {
                body: { title: 'Dolly', body: 'A sheep' },
            });

            const read = await client.call('getNote', {
                path: { noteId: (note as { id: string }).id },
            });

            expect(read).to.deep.equal({ status: 200, body: note });
        });

        withServer.test('Answers 404 for a note that does not exist', async ({ anonymous }) => {
            const read = await anonymous.call('getNote', {
                path: { noteId: '00000000-0000-4000-8000-000000000000' },
            });

            expect(read.status).to.equal(404);
        });

        withServer.test('Rejects an id that is not a UUID', async ({ anonymous }) => {
            const read = await anonymous.call('getNote', { path: { noteId: 'dolly' } });

            expect(read.status).to.equal(400);
        });
    });

    withServer.test('Lists nothing on an empty database', async ({ anonymous }) => {
        expect(await anonymous.call('listNotes', {})).to.deep.equal({
            status: 200,
            body: { items: [] },
        });
    });

    suite('listNotes', () => {
        /**
         * Notes added straight to the database, a minute apart, so their order is known.
         */
        const withNotes = withServer.beforeEach(async ({ db }) => {
            const rows = await db
                .insert(notes)
                .values(
                    Array.from({ length: 25 }, (_, index) => ({
                        title: `Note ${index}`,
                        body: '',
                        createdAt: sql`timestamptz '2026-01-01T00:00:00Z' + ${index} * interval '1 minute'`,
                    }))
                )
                .returning();
            return { rows };
        });

        withNotes.test('Lists the newest first', async ({ anonymous }) => {
            const { body } = await anonymous.call('listNotes', { query: { limit: 3 } });

            expect(
                (body as { items: { title: string }[] }).items.map(({ title }) => title)
            ).to.deep.equal(['Note 24', 'Note 23', 'Note 22']);
        });

        withNotes.test('Lists 20 by default, as the spec says', async ({ anonymous }) => {
            const { body } = await anonymous.call('listNotes', {});

            expect((body as { items: unknown[] }).items).to.have.length(20);
        });

        withServer.test('Rejects a limit out of range', async ({ anonymous }) => {
            const listed = await anonymous.call('listNotes', { query: { limit: 0 } });

            expect(listed.status).to.equal(400);
        });

        withServer.test('Rejects a limit that is not a number', async ({ served }) => {
            const response = await fetch(`${served.url}/notes?limit=many`);

            expect(response.status).to.equal(400);
        });

        withServer.test('Rejects query parameters the spec does not have', async ({ served }) => {
            const response = await fetch(`${served.url}/notes?offset=10`);

            expect(response.status).to.equal(400);
        });
    });

    withServer.test('Answers 404 for a path the spec does not have', async ({ served }) => {
        const response = await fetch(`${served.url}/sheep`);

        expect(response.status).to.equal(404);
        expect(await response.json()).to.include({ code: 'not_found' });
    });

    suite('Responses', () => {
        /**
         * The app with handlers that break the spec, swapped in one binding at a time.
         *
         * @returns The app, served, and the errors it reported
         */
        const withHandlers = withDatabase().beforeEach(async ({ database }) => {
            const pool = new pg.Pool({ connectionString: database.url, max: 2 });
            const db = drizzle({ client: pool });
            const errors: Error[] = [];
            const serveWith = async (handlers: Partial<NotesHandlers>) => {
                const app = createContainer(
                    notesModule
                        .addBinding(bind(databaseId).withInstance(db))
                        .addBinding(staticTokensBinding([token]))
                        .addBinding(
                            bind(appConfigId).withInstance({
                                onError: error => {
                                    errors.push(error);
                                },
                            })
                        )
                        .replaceBinding(
                            bind(handlersId).withInstance({ ...drizzleHandlers(db), ...handlers })
                        )
                ).get(notesAppId);
                return listen(app);
            };
            return { pool, errors, serveWith, closing: [] as (() => Promise<void>)[] };
        });
        withHandlers.afterEach(async ({ pool, closing }) => {
            await Promise.all(closing.map(async close => close()));
            await pool.end();
        });

        withHandlers.test(
            'Never sends a body that breaks the schema',
            async ({ serveWith, closing, errors }) => {
                const served = await serveWith({
                    getNote: async () => ({
                        status: 200,
                        body: { id: 'not-a-uuid', title: '', body: '', createdAt: '' },
                    }),
                });
                closing.push(served.close);

                const response = await fetch(
                    `${served.url}/notes/00000000-0000-4000-8000-000000000000`
                );

                expect(response.status).to.equal(500);
                expect(errors[0]).to.be.instanceOf(NotesResponseError);
            }
        );

        withHandlers.test(
            'Never sends a status the spec does not document',
            async ({ serveWith, closing, errors }) => {
                const served = await serveWith({
                    getNote: async () =>
                        ({ status: 418, body: { code: 'teapot', message: '' } }) as never,
                });
                closing.push(served.close);

                const response = await fetch(
                    `${served.url}/notes/00000000-0000-4000-8000-000000000000`
                );

                expect(response.status).to.equal(500);
                expect(errors[0]).to.include({ status: 418 });
            }
        );

        withHandlers.test(
            'Reports a handler that throws',
            async ({ serveWith, closing, errors }) => {
                const failure = new Error('Database is down');
                const served = await serveWith({
                    getNote: async () => {
                        throw failure;
                    },
                });
                closing.push(served.close);

                const response = await fetch(
                    `${served.url}/notes/00000000-0000-4000-8000-000000000000`
                );

                expect(response.status).to.equal(500);
                expect(errors).to.deep.equal([failure]);
            }
        );
    });
});
