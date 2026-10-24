import type { Env } from '@leyman/nx-cache-worker';
import { expect } from '@leyman/expect';
import worker from '@leyman/nx-cache-worker';
import { before, suite } from 'mocha-chain';
import { handle } from '#internal/handle.js';
import { startIssuer } from '../helpers/issuer.js';
import { startWorker, uniqueHash } from '../helpers/miniflare.js';

const dayMs = 24 * 60 * 60 * 1000;

const url = (hash: string): string => `https://cache.test/v1/cache/${hash}`;

/**
 * A `PUT` of a task result.
 *
 * @param hash - Nx's hash of the task
 * @param body - the result
 * @param token - bearer token, if any
 * @returns the request
 */
const put = (hash: string, body: string, token?: string): Request =>
    new Request(url(hash), {
        body,
        method: 'PUT',
        // As the cache server sends, and the Worker requires. A `Request` built here has none of its own
        headers: {
            'content-length': String(globalThis.Buffer.byteLength(body)),
            ...(token !== undefined && { authorization: `Bearer ${token}` }),
        },
    });

suite('nx-cache-worker', () => {
    const withWorker = before(async () => {
        const issuer = await startIssuer();
        const { env, miniflare } = await startWorker(issuer.url);
        return { env, issuer, miniflare };
    });
    withWorker.after(async ({ issuer, miniflare }) => {
        await miniflare.dispose();
        await issuer.close();
    });

    /**
     * Store a result, as CI on `main` would.
     *
     * @param env - the Worker's bindings
     * @param token - a token that may write
     * @param body - the result
     * @param now - current time
     * @returns its hash
     */
    const store = async (
        env: Env,
        token: string,
        body = 'tarball',
        now = Date.now()
    ): Promise<string> => {
        const hash = uniqueHash();
        const response = await handle(put(hash, body, token), env, now);
        expect(response.status).to.equal(200);
        return hash;
    };

    suite('read', () => {
        withWorker.test('a stored result', async ({ env, issuer }) => {
            const hash = await store(env, issuer.sign(), 'the tarball');

            const response = await handle(new Request(url(hash)), env, Date.now());

            expect(response.status).to.equal(200);
            expect(await response.text()).to.equal('the tarball');
            expect(response.headers.get('content-length')).to.equal('11');
            expect(response.headers.get('content-type')).to.equal('application/octet-stream');
            const stored = await env.cache.head(hash);
            expect(response.headers.get('last-modified')).to.equal(stored?.uploaded.toUTCString());
        });

        withWorker.test('nothing stored', async ({ env }) => {
            const response = await handle(new Request(url(uniqueHash())), env, Date.now());

            expect(response.status).to.equal(404);
        });

        withWorker.test('a result older than the maximum age', async ({ env, issuer }) => {
            const hash = await store(env, issuer.sign());

            const response = await handle(new Request(url(hash)), env, Date.now() + 8 * dayMs);

            expect(response.status).to.equal(404);
        });

        withWorker.test('another path', async ({ env }) => {
            for (const path of ['/', '/v1/cache/', '/v1/cache/a/b', '/v1/cache/a.b']) {
                const response = await handle(
                    new Request(`https://cache.test${path}`),
                    env,
                    Date.now()
                );
                expect(response.status, path).to.equal(404);
            }
        });

        withWorker.test('another method', async ({ env }) => {
            const response = await handle(
                new Request(url(uniqueHash()), { method: 'DELETE' }),
                env,
                Date.now()
            );

            expect(response.status).to.equal(405);
        });
    });

    suite('write', () => {
        withWorker.test('a result already stored is kept', async ({ env, issuer }) => {
            const hash = await store(env, issuer.sign(), 'first');

            const response = await handle(put(hash, 'second', issuer.sign()), env, Date.now());

            expect(response.status).to.equal(409);
            const read = await handle(new Request(url(hash)), env, Date.now());
            expect(await read.text()).to.equal('first');
        });

        withWorker.test('an expired result is replaced', async ({ env, issuer }) => {
            const hash = await store(env, issuer.sign(), 'first');
            const later = Date.now() + 8 * dayMs;

            const response = await handle(
                put(hash, 'second', issuer.sign({ exp: later / 1000 + 300 })),
                env,
                later
            );

            expect(response.status).to.equal(200);
            // Stored now, so fresh as of now
            const read = await handle(new Request(url(hash)), env, Date.now());
            expect(await read.text()).to.equal('second');
        });

        withWorker.test('without a length', async ({ env, issuer }) => {
            // `duplex` is needed for a stream body, but missing from the DOM types
            const blob = new Blob(['tarball']);
            const streamInit: RequestInit & { duplex: 'half' } = {
                method: 'PUT',
                body: blob.stream(),
                duplex: 'half',
                headers: { authorization: `Bearer ${issuer.sign()}` },
            };
            const stream = new Request(url(uniqueHash()), streamInit);
            const empty = new Request(url(uniqueHash()), {
                method: 'PUT',
                headers: { authorization: `Bearer ${issuer.sign()}`, 'content-length': '0' },
            });

            for (const request of [stream, empty]) {
                const response = await handle(request, env, Date.now());
                expect(response.status).to.equal(411);
            }
        });

        suite('needs a token that may write', () => {
            withWorker.test('no token', async ({ env }) => {
                const bare = put(uniqueHash(), 'tarball');
                const basic = new Request(url(uniqueHash()), {
                    method: 'PUT',
                    body: 'tarball',
                    headers: { authorization: 'Basic dXNlcjpwYXNz', 'content-length': '7' },
                });

                for (const request of [bare, basic]) {
                    const response = await handle(request, env, Date.now());
                    expect(response.status).to.equal(401);
                    expect(await response.text()).to.contain('OIDC token');
                }
            });

            withWorker.test('not a token from the issuer', async ({ env, issuer }) => {
                const [header, payload, signature] = issuer.sign().split('.') as [
                    string,
                    string,
                    string,
                ];
                const encode = (value: unknown): string =>
                    globalThis.Buffer.from(JSON.stringify(value)).toString('base64url');
                const tokens = {
                    'not a JWT': 'not-a-jwt',
                    'too many parts': `${header}.${payload}.${signature}.extra`,
                    'a header that is not JSON': `not-json.${payload}.${signature}`,
                    'a header that is not an object': `${encode([1])}.${payload}.${signature}`,
                    'a header that is null': `${encode(null)}.${payload}.${signature}`,
                    'a payload that is not JSON': `${header}.%%%.${signature}`,
                    'another algorithm': issuer.sign({}, { header: { alg: 'HS256' } }),
                    'no key ID': issuer.sign({}, { header: { kid: 1 } }),
                    'an unknown key': issuer.sign({}, { header: { kid: 'unknown' } }),
                    'signed by another key': issuer.sign({}, { untrusted: true }),
                    'a signature that is not base64url': `${header}.${payload}.!!!`,
                    'another issuer': issuer.sign({ iss: 'https://other.test' }),
                    'another audience': issuer.sign({ aud: 'other' }),
                    expired: issuer.sign({ exp: Date.now() / 1000 - 120 }),
                    'no expiry': issuer.sign({ exp: 'never' }),
                    'not valid yet': issuer.sign({ nbf: Date.now() / 1000 + 120 }),
                };

                for (const [name, token] of Object.entries(tokens)) {
                    const response = await handle(
                        put(uniqueHash(), 'tarball', token),
                        env,
                        Date.now()
                    );
                    expect(response.status, name).to.equal(401);
                }
            });

            withWorker.test('a key that can not be imported', async ({ env, issuer }) => {
                issuer.serveBrokenKey('broken');

                const response = await handle(
                    put(uniqueHash(), 'tarball', issuer.sign({}, { header: { kid: 'broken' } })),
                    env,
                    Date.now()
                );

                expect(response.status).to.equal(401);
            });

            withWorker.test('within the clock skew', async ({ env, issuer }) => {
                const seconds = Date.now() / 1000;
                for (const claims of [
                    { exp: seconds - 30 },
                    { nbf: seconds + 30 },
                    { nbf: undefined },
                ]) {
                    const response = await handle(
                        put(uniqueHash(), 'tarball', issuer.sign(claims)),
                        env,
                        Date.now()
                    );
                    expect(response.status, JSON.stringify(claims)).to.equal(200);
                }
            });

            withWorker.test('one of several audiences', async ({ env, issuer }) => {
                const response = await handle(
                    put(uniqueHash(), 'tarball', issuer.sign({ aud: ['other', env.oidcAudience] })),
                    env,
                    Date.now()
                );

                expect(response.status).to.equal(200);
            });

            withWorker.test(
                'not from a push to main of the repository',
                async ({ env, issuer }) => {
                    const tokens = {
                        'another repository': issuer.sign({ repository_id: '1' }),
                        'another branch': issuer.sign({ ref: 'refs/heads/feature' }),
                        'a pull request': issuer.sign({
                            event_name: 'pull_request',
                            ref: 'refs/pull/1/merge',
                        }),
                        // `pull_request_target` runs in main's context, but for code from the pull request
                        'a pull_request_target': issuer.sign({ event_name: 'pull_request_target' }),
                    };

                    for (const [name, token] of Object.entries(tokens)) {
                        const response = await handle(
                            put(uniqueHash(), 'tarball', token),
                            env,
                            Date.now()
                        );
                        expect(response.status, name).to.equal(403);
                        expect(await response.text(), name).to.contain('main');
                    }
                }
            );
        });

        suite('signing keys', () => {
            // Each test has an issuer of its own, so other tests' fetches don't count
            withWorker.test('are fetched once, until they are old', async ({ env }) => {
                const issuer = await startIssuer();
                try {
                    const own = { ...env, oidcIssuer: issuer.url };
                    await store(own, issuer.sign());
                    await store(own, issuer.sign());
                    expect(issuer.keyRequests()).to.equal(1);

                    const later = Date.now() + 2 * 60 * 60 * 1000;
                    await store(own, issuer.sign({ exp: later / 1000 + 300 }), 'tarball', later);
                    expect(issuer.keyRequests()).to.equal(2);
                } finally {
                    await issuer.close();
                }
            });

            withWorker.test('are fetched again for a new key', async ({ env }) => {
                const issuer = await startIssuer();
                try {
                    const own = { ...env, oidcIssuer: issuer.url };
                    await store(own, issuer.sign());
                    await issuer.rotate();

                    await store(own, issuer.sign());

                    expect(issuer.keyRequests()).to.equal(2);
                } finally {
                    await issuer.close();
                }
            });

            withWorker.test('that can not be fetched', async ({ env }) => {
                const failing = await startIssuer();
                failing.fail();
                const closed = await startIssuer();
                await closed.close();
                try {
                    for (const issuer of [failing, closed]) {
                        const response = await handle(
                            put(uniqueHash(), 'tarball', issuer.sign()),
                            { ...env, oidcIssuer: issuer.url },
                            Date.now()
                        );
                        expect(response.status).to.equal(503);
                    }
                } finally {
                    await failing.close();
                }
            });
        });
    });

    suite('the Worker', () => {
        withWorker.test('runs on workerd', async ({ env, issuer, miniflare }) => {
            const hash = uniqueHash();
            const stored = await miniflare.dispatchFetch(url(hash), {
                method: 'PUT',
                body: 'tarball',
                headers: { authorization: `Bearer ${issuer.sign()}`, 'content-length': '7' },
            });
            expect(stored.status).to.equal(200);

            const read = await miniflare.dispatchFetch(url(hash));
            expect(read.status).to.equal(200);
            expect(await read.text()).to.equal('tarball');
            // The same bucket as the tests reach from Node
            const object = await env.cache.get(hash);
            await object?.body.cancel();
            expect(object?.size).to.equal('tarball'.length);
        });

        withWorker.test('handles requests as of now', async ({ env, issuer }) => {
            const hash = await store(env, issuer.sign());

            const response = await worker.fetch(new Request(url(hash)), env);

            expect(response.status).to.equal(200);
            await response.body?.cancel();
        });
    });
});
