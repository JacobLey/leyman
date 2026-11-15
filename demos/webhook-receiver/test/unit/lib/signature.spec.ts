import {
    parseWebhookSecret,
    signWebhook,
    verifyWebhook,
    WebhookSecretError,
} from '@leyman/demo-webhook-receiver';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';

// The test vector of Standard Webhooks' reference libraries
// https://github.com/standard-webhooks/standard-webhooks/blob/main/libraries/javascript/src/index.test.ts
const vector = {
    secret: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
    id: 'msg_p5jXN8AQM9LWM0D4loKWxJek',
    timestamp: 1_614_265_330,
    body: '{"test": 2432232314}',
    signature: 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=',
};
/**
 * A secret of the length given, every byte the same.
 *
 * @param length - Its bytes
 * @param fill - The value of each
 * @returns `whsec_` and the bytes in base64
 */
const secretOf = (length: number, fill = 0): string => {
    const key = new Uint8Array(length);
    key.fill(fill);
    return `whsec_${key.toBase64()}`;
};
const otherSecret = secretOf(32, 7);

const encoder = new TextEncoder();
const payload = encoder.encode(vector.body);
const now = vector.timestamp * 1000;

const headers = (signature: string, overrides: Record<string, string> = {}): Headers =>
    new Headers({
        'webhook-id': vector.id,
        'webhook-timestamp': String(vector.timestamp),
        'webhook-signature': signature,
        ...overrides,
    });

const verify = async (
    signature: string,
    { secrets = [vector.secret], at = now, overrides = {}, signedBody = payload } = {}
) =>
    verifyWebhook(
        { headers: headers(signature, overrides), body: signedBody, secrets },
        { now: at }
    );

suite('signature', () => {
    suite('parseWebhookSecret', () => {
        test('Decodes the base64 after whsec_', () => {
            expect(parseWebhookSecret(vector.secret)).to.deep.equal(
                Uint8Array.fromBase64('MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw')
            );
        });

        test('Refuses a secret without the prefix', () => {
            expect(() => parseWebhookSecret('MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw')).to.throw(
                WebhookSecretError
            );
        });

        test('Refuses a secret that is not base64', () => {
            expect(() => parseWebhookSecret('whsec_not base64!')).to.throw(WebhookSecretError);
        });

        test('Refuses a secret under 24 bytes', () => {
            expect(() => parseWebhookSecret(secretOf(23))).to.throw(WebhookSecretError);
        });

        test('Refuses a secret over 64 bytes', () => {
            expect(() => parseWebhookSecret(secretOf(65))).to.throw(WebhookSecretError);
        });
    });

    suite('signWebhook', () => {
        test('Signs the test vector', async () => {
            const signature = await signWebhook({
                id: vector.id,
                timestamp: vector.timestamp,
                body: payload,
                secrets: [vector.secret],
            });
            expect(signature).to.equal(vector.signature);
        });

        test('Signs once per secret', async () => {
            const signature = await signWebhook({
                id: vector.id,
                timestamp: vector.timestamp,
                body: payload,
                secrets: [vector.secret, otherSecret],
            });
            expect(signature.split(' ')).to.have.length(2).and.to.include(vector.signature);
        });

        test('Rejects a malformed secret', async () => {
            await expect(
                signWebhook({ id: vector.id, timestamp: 1, body: payload, secrets: ['secret'] })
            ).to.be.rejectedWith(WebhookSecretError);
        });
    });

    suite('verifyWebhook', () => {
        test('Accepts the test vector', async () => {
            expect(await verify(vector.signature)).to.deep.equal({
                valid: true,
                id: vector.id,
                timestamp: vector.timestamp,
            });
        });

        for (const header of ['webhook-id', 'webhook-timestamp', 'webhook-signature']) {
            test(`Refuses a delivery without ${header}`, async () => {
                const missing = headers(vector.signature);
                missing.delete(header);
                expect(
                    await verifyWebhook(
                        { headers: missing, body: payload, secrets: [vector.secret] },
                        { now }
                    )
                ).to.deep.equal({ valid: false, reason: 'missing-header' });
            });

            test(`Refuses a delivery with an empty ${header}`, async () => {
                expect(
                    await verify(vector.signature, { overrides: { [header]: '' } })
                ).to.deep.equal({
                    valid: false,
                    reason: 'missing-header',
                });
            });
        }

        test('Refuses a timestamp that is not whole seconds', async () => {
            expect(
                await verify(vector.signature, {
                    overrides: { 'webhook-timestamp': `${vector.timestamp}.5` },
                })
            ).to.deep.equal({ valid: false, reason: 'malformed' });
        });

        test('Accepts a timestamp 5 minutes old', async () => {
            expect(await verify(vector.signature, { at: now + 300_000 })).to.include({
                valid: true,
            });
        });

        test('Refuses a timestamp more than 5 minutes old', async () => {
            expect(await verify(vector.signature, { at: now + 301_000 })).to.deep.equal({
                valid: false,
                reason: 'stale',
            });
        });

        test('Accepts a timestamp 5 minutes ahead', async () => {
            expect(await verify(vector.signature, { at: now - 300_000 })).to.include({
                valid: true,
            });
        });

        test('Refuses a timestamp more than 5 minutes ahead', async () => {
            expect(await verify(vector.signature, { at: now - 301_000 })).to.deep.equal({
                valid: false,
                reason: 'future',
            });
        });

        test('Takes the tolerance as an option', async () => {
            expect(
                await verifyWebhook(
                    { headers: headers(vector.signature), body: payload, secrets: [vector.secret] },
                    { now: now + 2000, toleranceMs: 1000 }
                )
            ).to.deep.equal({ valid: false, reason: 'stale' });
        });

        test('Checks the timestamp against the current time by default', async () => {
            const timestamp = Math.floor(Date.now() / 1000);
            const current = new Headers({
                'webhook-id': vector.id,
                'webhook-timestamp': String(timestamp),
                'webhook-signature': await signWebhook({
                    id: vector.id,
                    body: payload,
                    secrets: [vector.secret],
                    timestamp,
                }),
            });
            expect(
                await verifyWebhook({ headers: current, body: payload, secrets: [vector.secret] })
            ).to.include({ valid: true });
        });

        test('Refuses a tampered body', async () => {
            expect(
                await verify(vector.signature, { signedBody: encoder.encode('{"test": 1}') })
            ).to.deep.equal({ valid: false, reason: 'signature' });
        });

        test('Refuses a signature by another secret', async () => {
            expect(await verify(vector.signature, { secrets: [otherSecret] })).to.deep.equal({
                valid: false,
                reason: 'signature',
            });
        });

        test('Refuses a signed timestamp that was changed', async () => {
            expect(
                await verify(vector.signature, {
                    overrides: { 'webhook-timestamp': String(vector.timestamp + 1) },
                })
            ).to.deep.equal({ valid: false, reason: 'signature' });
        });

        test('Ignores signatures of other versions', async () => {
            const signature = vector.signature.slice('v1,'.length);
            expect(await verify(`v1a,${signature} v2,${signature}`)).to.deep.equal({
                valid: false,
                reason: 'signature',
            });
        });

        test('Accepts a matching signature among others', async () => {
            expect(await verify(`v2,abc v1,not-base64! ${vector.signature}`)).to.include({
                valid: true,
            });
        });

        test('Accepts the old or the new secret while rotating', async () => {
            const signature = await signWebhook({
                id: vector.id,
                timestamp: vector.timestamp,
                body: payload,
                secrets: [vector.secret, otherSecret],
            });
            const results = await Promise.all(
                [[vector.secret], [otherSecret], [vector.secret, otherSecret]].map(async secrets =>
                    verify(signature, { secrets })
                )
            );
            expect(results.map(({ valid }) => valid)).to.deep.equal([true, true, true]);
        });

        test('Rejects a malformed secret', async () => {
            await expect(verify(vector.signature, { secrets: ['whsec_'] })).to.be.rejectedWith(
                WebhookSecretError
            );
        });
    });
});
