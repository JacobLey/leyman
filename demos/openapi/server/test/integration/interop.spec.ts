import type { Context } from 'mocha';
import type { NotesHandlers } from '@leyman/demo-openapi-server';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import {
    appConfigId,
    databaseId,
    drizzleHandlers,
    handlersId,
    notesAppId,
    notesModule,
    staticTokensBinding,
} from '@leyman/demo-openapi-server';
import { expect } from '@leyman/expect';
import { bind, createContainer } from 'haywire';
import { suite } from 'mocha-chain';
import { withDatabase } from '#test/helpers/database.js';
import {
    go,
    goModule,
    implementations,
    startGo,
    typescript,
} from '#test/helpers/implementations.js';
import { postNote } from '#test/helpers/post.js';
import { run } from '#test/helpers/run.js';
import { listen } from '#test/helpers/serve.js';

const token = 'secret-token';
// Another user's
const otherToken = 'other-token';
const tokens = [
    { token, subject: 'alice' },
    { token: otherToken, subject: 'bob' },
];
const dolly = { title: 'Dolly', body: 'A sheep' };

suite('A retry that reaches the other server', () => {
    /**
     * One database, which both servers share, as two deployments behind one load balancer would.
     */
    const withPool = withDatabase().beforeEach(async ({ database }) => {
        const pool = new Pool({ connectionString: database.url, max: 2 });
        return {
            pool,
            count: async (): Promise<number> => {
                const { rows } = await pool.query('SELECT * FROM notes');
                return rows.length;
            },
        };
    });
    withPool.afterEach(async ({ pool }) => {
        await pool.end();
    });

    for (const [first, second] of [
        [typescript, go],
        [go, typescript],
    ] as const) {
        withPool.test(
            `Replays a note added by the ${first.name} server from the ${second.name} server`,
            async ({ database, count }) => {
                const options = { databaseUrl: database.url, authentication: { tokens } };
                const [one, other] = await Promise.all([
                    first.start(options),
                    second.start(options),
                ]);
                try {
                    const ran = await postNote(one.url, { token, body: dolly, key: 'key-1' });
                    const retry = await postNote(other.url, { token, body: dolly, key: 'key-1' });

                    expect(ran.status).to.equal(201);
                    expect(retry.status).to.equal(201);
                    expect(retry.headers.get('idempotent-replayed')).to.equal('true');
                    expect(await retry.json()).to.deep.equal(await ran.json());
                    expect(await count()).to.equal(1);
                } finally {
                    await Promise.all([one.close(), other.close()]);
                }
            }
        );
    }

    withPool.test(
        'Answers the Go server a 409 while the TypeScript server still runs the first',
        async ({ database, pool }) => {
            // The TypeScript server's `createNote`, held until the test lets it go on, so the key stays claimed
            const db = drizzle({ client: pool });
            const { promise: opened, resolve: open } = Promise.withResolvers<void>();
            const { promise: started, resolve: start } = Promise.withResolvers<void>();
            const { createNote } = drizzleHandlers(db);
            const held = await listen(
                createContainer(
                    notesModule
                        .addBinding(bind(databaseId).withInstance(db))
                        .addBinding(staticTokensBinding(tokens))
                        .addBinding(bind(appConfigId).withInstance({ onError: () => {} }))
                        .replaceBinding(
                            bind(handlersId).withInstance({
                                ...drizzleHandlers(db),
                                createNote: async (
                                    ...args: Parameters<NotesHandlers['createNote']>
                                ) => {
                                    start();
                                    await opened;
                                    return createNote(...args);
                                },
                            })
                        )
                ).get(notesAppId)
            );
            // Without waiting, so the duplicate's answer doesn't depend on how long the first takes
            const other = await startGo({ databaseUrl: database.url, authentication: { tokens } }, [
                '--idempotency-wait',
                '0s',
            ]);
            try {
                const ran = postNote(held.url, { token, body: dolly, key: 'key-1' });
                await started;
                const duplicate = await postNote(other.url, { token, body: dolly, key: 'key-1' });
                open();

                expect(duplicate.status).to.equal(409);
                expect(await duplicate.json()).to.include({ code: 'idempotency_key_in_use' });
                const first = await ran;
                expect(first.status).to.equal(201);
            } finally {
                open();
                await Promise.all([held.close(), other.close()]);
            }
        }
    );
});

// The Go client's own tests, run against each server: they read the server and tokens from the environment
for (const implementation of implementations) {
    suite(`The Go client on ${implementation.name}`, () => {
        const withServer = withDatabase().beforeEach(async ({ database }) => ({
            served: await implementation.start({
                databaseUrl: database.url,
                authentication: { tokens },
            }),
        }));
        withServer.afterEach(async ({ served }) => {
            await served.close();
        });

        withServer.test('Calls every operation', async function (this: Context, { served }) {
            // Compiling the test binary can take a while on a cold cache
            this.timeout(300_000);

            await run(
                'go',
                ['test', '-tags', 'interop', '-count', '1', '-run', '^TestInterop', './client/...'],
                {
                    cwd: goModule,
                    env: {
                        NOTES_INTEROP_URL: served.url,
                        NOTES_INTEROP_TOKEN: token,
                        NOTES_INTEROP_OTHER_TOKEN: otherToken,
                    },
                }
            );

            expect(await served.close()).to.deep.equal([]);
        });
    });
}
