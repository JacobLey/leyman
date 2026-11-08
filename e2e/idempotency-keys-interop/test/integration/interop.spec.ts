import type { Context } from 'mocha';
import type { InteropResponse } from '../helpers/http.js';
import type { Language, Server, ServerConfig } from '../helpers/servers.js';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { expect } from '@leyman/expect';
import testVectors from '@leyman/idempotency-keys-test-vectors/test-vectors.json' with {
    type: 'json',
};
import { suite } from 'mocha-chain';
import { withDolly } from '../helpers/database.js';
import { send } from '../helpers/http.js';
import { startServer } from '../helpers/servers.js';

const combinations = [
    { store: 'postgres', notifier: 'postgres' },
    { store: 'postgres', notifier: 'valkey' },
    { store: 'postgres', notifier: 'none' },
    { store: 'valkey', notifier: 'valkey' },
    { store: 'valkey', notifier: 'none' },
] as const satisfies readonly Pick<ServerConfig, 'notifier' | 'store'>[];

const directions = [
    ['ts', 'go'],
    ['go', 'ts'],
] as const satisfies readonly (readonly [Language, Language])[];

const leaseMs = 1500;
const waitMs = 1000;

/**
 * Both implementations poll a running record after sleeping 50 ms, then twice as long each time (up to a second):
 * `firstPollMs` in the TypeScript `src/lib/idempotency-keys.ts`, `firstPoll` in the Go `idempotencykeys.go`. So a
 * waiting request claims at 0, 50, 150, 350 and 750 ms after it arrives, and no sooner, as each sleep only adds
 * to the time its claims take.
 *
 * The wake-up test completes the first request about 450 ms after the duplicate arrives, shortly after its claim at
 * 350 ms, so by polling alone it would answer no sooner than its claim at 750 ms, some 300 ms after the first. The
 * test measures the gap between the two responses, rather than either one's time, so a slow handler or a loaded
 * machine doesn't move the bound: under half the distance to the next claim, only a notification can answer.
 */
const wakeDelayMs = 450;
const wokenWithinMs = 150;
/**
 * Longer than the wait, so the duplicate's wait runs out, and shorter than the lease, so it never takes over.
 */
const conflictDelayMs = 1300;

const valkeyUrl = 'redis://valkey:6379/6';

/**
 * The request targets the servers exchange, from the test vectors: each is sent raw to one server, and to the
 * other as the target it normalizes to, which the other replays.
 */
const normalizedTargets = [
    '/a/../notes',
    '/notes\\sub',
    '/%2e/notes',
    '/a/.%2E/notes',
    // eslint-disable-next-line sonarjs/no-clear-text-protocols -- An absolute-form target, never fetched
    'http://host/notes?draft=1',
    '/café',
    '/🐦',
].map(raw => {
    const vector = testVectors.targets.find(target => target.raw === raw);
    if (!vector) {
        throw new Error(`No target vector for ${raw}`);
    }
    return vector;
});

// Node's HTTP parser answers a raw non-ASCII byte in the target with a 400, before the server sees it, while Go's
// accepts it: the raw form only goes to Go
const isAscii = (target: string): boolean => /^\p{ASCII}*$/v.test(target);

/**
 * When a response arrived.
 *
 * @param request - Request under way
 * @returns Its response, and the `performance.now()` it arrived at
 */
const answeredAt = async (
    request: Promise<InteropResponse>
): Promise<{ response: InteropResponse; at: number }> => {
    const response = await request;
    return { response, at: performance.now() };
};

/**
 * The handler's response body.
 *
 * @param response - Response of the handler, or its replay
 * @returns Its server and run
 */
const ran = (response: InteropResponse): { server: string; run: number } =>
    JSON.parse(response.body) as { server: string; run: number };

/**
 * How many times a server ran the handler for a scope, read with a request without a key (which runs it once more).
 *
 * @param server - Server to ask
 * @param scope - Scope of the requests to count
 * @returns Runs so far
 */
const runs = async (server: Server, scope: string): Promise<number> =>
    ran(await send(server.port, { scope })).run - 1;

const expectReplayOf = (replay: InteropResponse, original: InteropResponse): void => {
    expect(replay.status).to.equal(original.status);
    expect(replay.body).to.equal(original.body);
    expect(replay.headers.get('content-type')).to.equal(original.headers.get('content-type'));
    expect(replay.headers.get('idempotent-replayed')).to.equal('true');
};

/**
 * Checks a response is the server's first run of the handler for its scope, rather than a replay.
 *
 * @param response - Response to check
 * @param server - Server that should have run it
 * @param status - Status the handler was asked for
 */
const expectFirstRun = (response: InteropResponse, server: Server, status = 201): void => {
    expect(response.status).to.equal(status);
    expect(ran(response)).to.deep.equal({ server: server.language, run: 1 });
    expect(response.headers.get('content-type')).to.equal('application/json');
    expect(response.headers.has('idempotent-replayed')).to.equal(false);
};

const expectProblem = (response: InteropResponse, status: number): void => {
    expect(response.status).to.equal(status);
    expect(response.headers.get('content-type')).to.equal('application/problem+json');
};

for (const { store, notifier } of combinations as readonly Pick<
    ServerConfig,
    'notifier' | 'store'
>[]) {
    suite(`${store} store, ${notifier === 'none' ? 'no' : notifier} notifier`, () => {
        for (const [firstLanguage, secondLanguage] of directions) {
            suite(`${firstLanguage} first, then ${secondLanguage}`, () => {
                const withServers = withDolly.beforeEach(async ({ template }) => {
                    const isPostgresUsed = store === 'postgres' || notifier === 'postgres';
                    const database = isPostgresUsed ? await template.clone() : null;
                    const id = randomUUID();
                    const config: ServerConfig = {
                        store,
                        notifier,
                        leaseMs,
                        waitMs,
                        valkeyUrl,
                        table: 'idempotency_keys',
                        prefix: `idempotency-keys-interop:${id}`,
                        channel: `idempotency_keys_${id}`,
                        databaseUrl: database?.url ?? '',
                    };
                    const [first, second] = await Promise.all([
                        startServer(firstLanguage, config),
                        startServer(secondLanguage, config),
                    ]);
                    return { database, first, second, scope: randomUUID(), key: randomUUID() };
                });
                withServers.afterEach(async function (this: Context, { database, first, second }) {
                    await Promise.all([first.kill('SIGTERM'), second.kill('SIGTERM')]);
                    if (this.currentTest?.state === 'failed') {
                        database?.keep();
                    }
                });

                withServers.test(
                    'Replays a response from the other server',
                    async ({ first, second, scope, key }) => {
                        const original = await send(first.port, { scope, key });
                        expectFirstRun(original, first);

                        expectReplayOf(await send(second.port, { scope, key }), original);
                        expect(await runs(first, scope)).to.equal(1);
                        expect(await runs(second, scope)).to.equal(0);
                    }
                );

                withServers.test(
                    notifier === 'none'
                        ? 'Waits on a running request on the other server, and polls for its response'
                        : 'Waits on a running request on the other server, and is woken by its notification',
                    async ({ first, second, scope, key }) => {
                        const started = first.started(scope);
                        const running = answeredAt(
                            send(first.port, { scope, key, delayMs: wakeDelayMs })
                        );
                        await started;

                        const duplicate = await answeredAt(
                            send(second.port, { scope, key, delayMs: wakeDelayMs })
                        );

                        const original = await running;
                        expectFirstRun(original.response, first);
                        expectReplayOf(duplicate.response, original.response);
                        if (notifier !== 'none') {
                            expect(duplicate.at - original.at).to.be.below(wokenWithinMs);
                        }
                        expect(await runs(second, scope)).to.equal(0);
                    }
                );

                withServers.test(
                    'Answers 409 once its wait runs out while the other server holds the lease',
                    async ({ first, second, scope, key }) => {
                        const started = first.started(scope);
                        const running = send(first.port, { scope, key, delayMs: conflictDelayMs });
                        await started;

                        expectProblem(await send(second.port, { scope, key }), 409);
                        const original = await running;
                        expectFirstRun(original, first);
                        expectReplayOf(await send(second.port, { scope, key }), original);
                        expect(await runs(second, scope)).to.equal(0);
                    }
                );

                withServers.test(
                    'Answers 422 to the key with another body on the other server',
                    async ({ first, second, scope, key }) => {
                        expectFirstRun(
                            await send(first.port, { scope, key, body: '{"n":1}' }),
                            first
                        );
                        expectProblem(
                            await send(second.port, { scope, key, body: '{"n":2}' }),
                            422
                        );
                        expect(await runs(second, scope)).to.equal(0);
                    }
                );

                withServers.test(
                    'Takes over a request whose server was killed, once its lease runs out',
                    async ({ first, second, scope, key }) => {
                        const started = first.started(scope);
                        // Rejects once the server is killed: no response comes
                        const running = expect(send(first.port, { scope, key, delayMs: 60_000 })).to
                            .be.rejected;
                        await started;
                        // The claim came before the handler started, so its lease ends by then
                        const leaseEnds = performance.now() + leaseMs;
                        await first.kill('SIGKILL');
                        await running;

                        await setTimeout(leaseEnds + 100 - performance.now());
                        const takenOver = await send(second.port, { scope, key });
                        expectFirstRun(takenOver, second);
                        expectReplayOf(await send(second.port, { scope, key }), takenOver);
                    }
                );

                withServers.test(
                    'Runs a retry on the other server after a response the policy releases',
                    async ({ first, second, scope, key }) => {
                        expectFirstRun(
                            await send(first.port, { scope, key, status: 429 }),
                            first,
                            429
                        );

                        const retried = await send(second.port, { scope, key });
                        expectFirstRun(retried, second);
                        expectReplayOf(await send(first.port, { scope, key }), retried);
                    }
                );

                withServers.test(
                    'Normalizes request targets as the other server does',
                    async ({ first, second, scope }) => {
                        for (const { raw, target } of normalizedTargets) {
                            const key = randomUUID();
                            // The raw form goes to the first server, unless only Go accepts it
                            const isRawFirst = isAscii(raw) || first.language === 'go';
                            const original = await send(first.port, {
                                scope,
                                key,
                                target: isRawFirst ? raw : target,
                            });
                            expect(original.status, raw).to.equal(201);
                            const replay = await send(second.port, {
                                scope,
                                key,
                                target: isRawFirst ? target : raw,
                            });
                            expect(replay.headers.get('idempotent-replayed'), raw).to.equal('true');
                            expect(replay.body, raw).to.equal(original.body);
                        }

                        // A percent-encoding stays as it is: these are two targets
                        const key = randomUUID();
                        const encoded = await send(first.port, {
                            scope,
                            key,
                            target: '/notes/%61',
                        });
                        expect(encoded.status).to.equal(201);
                        expectProblem(
                            await send(second.port, { scope, key, target: '/notes/a' }),
                            422
                        );

                        const ts = first.language === 'ts' ? first : second;
                        const rawNonAscii = await send(ts.port, {
                            scope,
                            key: randomUUID(),
                            target: '/café',
                        });
                        expect(rawNonAscii.status).to.equal(400);
                    }
                );
            });
        }
    });
}
