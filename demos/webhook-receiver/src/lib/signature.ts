import { hmac, verifyHmac } from 'iso-crypto';

/**
 * Thrown for a secret that isn't `whsec_` followed by 24 to 64 bytes in base64: a configuration mistake, never a
 * request's.
 */
export class WebhookSecretError extends Error {
    public constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'WebhookSecretError';
    }
}

const secretPrefix = 'whsec_';
// The sizes Standard Webhooks allows for a secret
// https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md#symmetric-hmac
const minSecretBytes = 24;
const maxSecretBytes = 64;

/**
 * Decodes a secret as Standard Webhooks shares it: `whsec_` and the key in base64. The HMAC is keyed with the decoded
 * bytes, never the string.
 *
 * @param secret - `whsec_...`
 * @returns The key's bytes
 * @throws {WebhookSecretError} When it isn't `whsec_` and 24 to 64 bytes in base64
 */
export const parseWebhookSecret = (secret: string): Uint8Array<ArrayBuffer> => {
    if (!secret.startsWith(secretPrefix)) {
        throw new WebhookSecretError(`A secret starts with ${secretPrefix}`);
    }
    let key: Uint8Array<ArrayBuffer>;
    try {
        key = Uint8Array.fromBase64(secret.slice(secretPrefix.length));
    } catch (error) {
        throw new WebhookSecretError('A secret is base64 after its prefix', { cause: error });
    }
    if (key.length < minSecretBytes || key.length > maxSecretBytes) {
        throw new WebhookSecretError(
            `A secret holds ${minSecretBytes} to ${maxSecretBytes} bytes, not ${key.length}`
        );
    }
    return key;
};

const encoder = new TextEncoder();

/**
 * The bytes a signature covers: `id.timestamp.body`, with the body as received.
 *
 * @param id - The event's id
 * @param timestamp - Seconds since the epoch, as sent
 * @param body - The bytes received
 * @returns `id.timestamp.` and the body, as bytes
 */
const signedContent = (
    id: string,
    timestamp: string,
    body: Uint8Array
): Uint8Array<ArrayBuffer> => {
    const prefix = encoder.encode(`${id}.${timestamp}.`);
    const content = new Uint8Array(prefix.length + body.length);
    content.set(prefix);
    content.set(body, prefix.length);
    return content;
};

export interface SignWebhookParams {
    /**
     * `webhook-id`: the event's id, the same on every retry.
     */
    readonly id: string;
    /**
     * `webhook-timestamp`: seconds since the epoch, new on every attempt.
     */
    readonly timestamp: number;
    readonly body: Uint8Array;
    /**
     * Each active secret (`whsec_...`), one signature each: two while rotating.
     */
    readonly secrets: readonly string[];
}

/**
 * Signs a delivery as a sender does: the receiver's tests use it, and it shows what the receiver checks.
 *
 * @param params - Id, timestamp, body and secrets
 * @returns The `webhook-signature` header: a space-separated `v1,<base64>` per secret
 * @throws {WebhookSecretError} For a malformed secret
 */
export const signWebhook = async ({
    id,
    timestamp,
    body,
    secrets,
}: SignWebhookParams): Promise<string> => {
    const data = signedContent(id, String(timestamp), body);
    const signatures = await Promise.all(
        secrets.map(async secret => {
            const signature = await hmac({ data, secret: parseWebhookSecret(secret) });
            return `v1,${signature.toBase64()}`;
        })
    );
    return signatures.join(' ');
};

/**
 * Why a delivery was refused:
 *
 * - `missing-header`: no `webhook-id`, `webhook-timestamp` or `webhook-signature`, or an empty one
 * - `malformed`: a timestamp that isn't whole seconds
 * - `stale`: a timestamp older than the tolerance, which is how a captured request replayed later looks
 * - `future`: a timestamp further ahead than the tolerance, which would otherwise be replayable until it went stale
 * - `signature`: no `v1` signature matches any secret
 */
export type WebhookRefusal = 'future' | 'malformed' | 'missing-header' | 'signature' | 'stale';

export type VerifyWebhookResult =
    | { readonly valid: false; readonly reason: WebhookRefusal }
    | { readonly valid: true; readonly id: string; readonly timestamp: number };

export interface VerifyWebhookParams {
    readonly headers: Headers;
    /**
     * The raw body, as received: re-serialized JSON wouldn't match the signature.
     */
    readonly body: Uint8Array;
    /**
     * Each secret (`whsec_...`) to accept: the old and the new one while rotating.
     */
    readonly secrets: readonly string[];
}

export interface VerifyWebhookOptions {
    /**
     * The current time, in milliseconds since the epoch.
     *
     * @default Date.now()
     */
    readonly now?: number;
    /**
     * How far the timestamp may be from `now`, either way. The reference libraries' default.
     *
     * @default 300_000
     */
    readonly toleranceMs?: number;
}

const millisecondsPerSecond = 1000;
const defaultToleranceMs = 300_000;
const wholeSeconds = /^\d+$/v;
const signatureVersion = 'v1,';

/**
 * Checks a delivery's headers and signature, as
 * [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md#verifying-webhook-authenticity)
 * says: the timestamp within the tolerance of `now`, and any `v1` signature matching any secret, each compared in
 * constant time. Signatures of other versions are ignored, as are ones that aren't base64.
 *
 * @param params - Headers, raw body and secrets
 * @param options - Current time and tolerance
 * @returns The id and timestamp, or why the delivery is refused
 * @rejects {WebhookSecretError} For a malformed secret
 */
export const verifyWebhook = async (
    { headers, body, secrets }: VerifyWebhookParams,
    { now = Date.now(), toleranceMs = defaultToleranceMs }: VerifyWebhookOptions = {}
): Promise<VerifyWebhookResult> => {
    const keys = secrets.map(secret => parseWebhookSecret(secret));
    // Absent and empty alike
    const id = headers.get('webhook-id') ?? '';
    const timestamp = headers.get('webhook-timestamp') ?? '';
    const signatures = headers.get('webhook-signature') ?? '';
    if (id === '' || timestamp === '' || signatures === '') {
        return { valid: false, reason: 'missing-header' };
    }
    if (!wholeSeconds.test(timestamp)) {
        return { valid: false, reason: 'malformed' };
    }
    const seconds = Number(timestamp);
    const offsetMs = seconds * millisecondsPerSecond - now;
    if (offsetMs < -toleranceMs) {
        return { valid: false, reason: 'stale' };
    }
    if (offsetMs > toleranceMs) {
        return { valid: false, reason: 'future' };
    }

    const data = signedContent(id, timestamp, body);
    const candidates = signatures
        .split(' ')
        .filter(entry => entry.startsWith(signatureVersion))
        .flatMap(entry => {
            try {
                return [Uint8Array.fromBase64(entry.slice(signatureVersion.length))];
            } catch {
                return [];
            }
        });
    const checks = await Promise.all(
        candidates.flatMap(signature =>
            keys.map(async secret => verifyHmac({ data, secret, signature }))
        )
    );
    return checks.includes(true)
        ? { valid: true, timestamp: seconds, id }
        : { valid: false, reason: 'signature' };
};
