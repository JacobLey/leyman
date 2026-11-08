import type { ValkeyConnection } from 'idempotency-keys';
import { randomBytes } from 'node:crypto';
import { expect } from '@leyman/expect';
import { ValkeyStore } from 'idempotency-keys';
import { beforeEach, suite, test } from 'mocha-chain';
import { claimScript, completeScript, releaseScript } from '#internal/lib/scripts.js';
import { closeValkey, valkeyContext } from '../helpers/valkey.js';
import { vectors } from '../helpers/vectors.js';

const encoder = new TextEncoder();
const fingerprint = 'f'.repeat(64);
const response = {
    status: 200,
    headers: [['content-type', 'application/octet-stream']],
    body: Uint8Array.from([0, 255, 128, 10]),
} as const;

suite('ValkeyStore', () => {
    test('Sends the scripts of the test vectors, byte for byte', () => {
        expect({
            claim: claimScript,
            complete: completeScript,
            release: releaseScript,
        }).to.deep.equal(vectors.valkeyScripts);
    });

    const withContext = beforeEach(valkeyContext).beforeEach(() => ({
        identity: randomBytes(32).toString('hex'),
    }));
    withContext.afterEach(closeValkey);

    const withStore = withContext.beforeEach(({ valkey, prefix }) => {
        const connection: ValkeyConnection = {
            eval: async (...args) => valkey.callBuffer('EVAL', ...args),
        };
        return { store: new ValkeyStore({ connection, prefix }) };
    });

    withStore.test(
        'Writes a running hash, then a completed one, as the spec describes',
        async ({ valkey, prefix, store, identity }) => {
            const key = `${prefix}:${identity}`;
            const [[, now]] = (await valkey.multi().time().exec()) as [[null, [string, string]]];
            await store.claim({
                identity,
                fingerprint,
                token: '1'.repeat(32),
                leaseMs: 60_000,
                ttlMs: 86_400_000,
            });
            const running = await valkey.hgetall(key);
            expect(running).to.have.keys(['fingerprint', 'token', 'lease']);
            expect(running).to.include({ fingerprint, token: '1'.repeat(32) });
            expect(Number(running.lease) - Number(now[0]) * 1000).to.be.within(59_000, 61_000);
            expect(await valkey.pttl(key)).to.be.within(86_000_000, 86_400_000);

            await store.complete(identity, '1'.repeat(32), {
                ...response,
                body: encoder.encode('ok'),
            });
            expect(await valkey.hgetall(key)).to.deep.equal({
                fingerprint,
                status: '200',
                headers: JSON.stringify(response.headers),
                body: 'ok',
            });
        }
    );

    withStore.test(
        'Replays a binary body byte for byte through callBuffer',
        async ({ store, identity }) => {
            await store.claim({
                identity,
                fingerprint,
                token: '1'.repeat(32),
                leaseMs: 60_000,
                ttlMs: 86_400_000,
            });
            await store.complete(identity, '1'.repeat(32), response);
            const result = await store.claim({
                identity,
                fingerprint,
                token: '2'.repeat(32),
                leaseMs: 1,
                ttlMs: 2,
            });
            expect(result)
                .to.have.nested.property('response.body')
                .that.deep.equals(Buffer.from(response.body));
        }
    );

    withContext.test(
        'Reads replies as text, through an eval that decodes them',
        async ({ valkey, prefix, identity }) => {
            const store = new ValkeyStore({ connection: valkey, prefix });
            await store.claim({
                identity,
                fingerprint,
                token: '1'.repeat(32),
                leaseMs: 60_000,
                ttlMs: 86_400_000,
            });
            await store.complete(identity, '1'.repeat(32), {
                ...response,
                body: encoder.encode('ñandú'),
            });
            const result = await store.claim({
                identity,
                fingerprint,
                token: '2'.repeat(32),
                leaseMs: 1,
                ttlMs: 2,
            });
            expect(result).to.deep.equal({
                fingerprint,
                state: 'completed',
                response: {
                    status: 200,
                    headers: response.headers,
                    body: encoder.encode('ñandú'),
                },
            });
        }
    );

    withContext.test(
        'Prefixes keys with idempotency_keys by default',
        async ({ valkey, identity }) => {
            const store = new ValkeyStore({ connection: valkey });
            // Shared with other tests' default prefix, so it expires soon rather than being deleted after
            await store.claim({
                identity,
                fingerprint,
                token: '1'.repeat(32),
                leaseMs: 1000,
                ttlMs: 2000,
            });
            expect(await valkey.hget(`idempotency_keys:${identity}`, 'token')).to.equal(
                '1'.repeat(32)
            );
        }
    );
});
