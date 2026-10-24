/**
 * Who may write: the claims a GitHub Actions OIDC token must have.
 */
export interface WriterPolicy {
    /**
     * `aud` the token was requested for.
     */
    readonly audience: string;
    /**
     * `iss` of the tokens, whose JWKS (`<issuer>/.well-known/jwks`) signs them.
     */
    readonly issuer: string;
    /**
     * Numeric ID of the repository whose workflows may write. Unlike its name, it never changes, and is never
     * reused by another repository.
     */
    readonly repositoryId: string;
}

/**
 * Whether a token may write: `valid` if so, `invalid` if it isn't a token from the issuer (expired, malformed,
 * or badly signed), and `forbidden` if it is, but not from a push to `main` of the repository.
 */
export type TokenCheck = 'forbidden' | 'invalid' | 'valid';

/**
 * A public key of the issuer, as its JWKS lists it.
 */
type SigningKey = JsonWebKey & { readonly kid?: string };

/**
 * Seconds a token may be used past its expiry, or before it is valid, for clocks that disagree.
 */
const clockSkewSeconds = 60;

const msPerSecond = 1000;

/**
 * How long to keep an issuer's keys before fetching them again.
 */
const keysMaxAgeMs = 3_600_000;

/**
 * Each issuer's signing keys, and when they were fetched. Kept across the requests a Worker isolate serves.
 */
const keyCache = new Map<string, { fetchedAt: number; keys: readonly SigningKey[] }>();

/**
 * Decode a base64url segment of a JWT.
 *
 * @param segment - base64url text
 * @returns decoded bytes
 * @throws {DOMException} if it is not base64url
 */
const decodeSegment = (segment: string): Uint8Array<ArrayBuffer> =>
    // `Uint8Array.fromBase64` isn't in Node 24, where the tests run. Each character is one byte
    Uint8Array.from(
        globalThis.atob(segment.replaceAll('-', '+').replaceAll('_', '/')),
        char => char.codePointAt(0)!
    );

/**
 * Parse a base64url JSON segment of a JWT.
 *
 * @param segment - base64url text
 * @returns parsed object, or `null` if it is not a JSON object
 */
const parseSegment = (segment: string): Readonly<Record<string, unknown>> | null => {
    try {
        const decoder = new TextDecoder();
        const parsed: unknown = JSON.parse(decoder.decode(decodeSegment(segment)));
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
            ? (parsed as Readonly<Record<string, unknown>>)
            : null;
    } catch {
        return null;
    }
};

/**
 * The signing key of an issuer with an ID, fetching its keys if they are old, or don't include it (as when
 * the issuer rotates keys).
 *
 * @param issuer - `iss` of the token
 * @param kid - ID of the key that signed it
 * @param now - current time, in milliseconds
 * @returns the key, or `null` if the issuer has none with the ID
 * @rejects {Error} if the keys can't be fetched
 */
const signingKey = async (issuer: string, kid: string, now: number): Promise<SigningKey | null> => {
    const find = (keys: readonly SigningKey[]): SigningKey | null =>
        keys.find(key => key.kid === kid) ?? null;
    const cached = keyCache.get(issuer);
    if (cached && now - cached.fetchedAt < keysMaxAgeMs) {
        const key = find(cached.keys);
        if (key) {
            return key;
        }
    }
    const response = await globalThis.fetch(`${issuer}/.well-known/jwks`);
    if (!response.ok) {
        throw new Error(`Fetching the signing keys of ${issuer} failed: HTTP ${response.status}`);
    }
    const { keys } = (await response.json()) as { keys: readonly SigningKey[] };
    keyCache.set(issuer, { fetchedAt: now, keys });
    return find(keys);
};

/**
 * Check a GitHub Actions OIDC token: signed by the issuer with RS256, for the audience, unexpired, and from a push to
 * `main` of the repository. So a pull request, even one from the same repository, can never write.
 *
 * @param token - the JWT
 * @param policy - claims it must have
 * @param now - current time, in milliseconds
 * @returns whether it may write
 * @rejects {Error} if the issuer's signing keys can't be fetched
 */
export const checkToken = async (
    token: string,
    policy: WriterPolicy,
    now: number
): Promise<TokenCheck> => {
    const [header = '', payload = '', signature = '', ...rest] = token.split('.');
    const headerClaims = parseSegment(header);
    const claims = parseSegment(payload);
    if (
        claims === null ||
        rest.length > 0 ||
        headerClaims?.alg !== 'RS256' ||
        typeof headerClaims.kid !== 'string'
    ) {
        return 'invalid';
    }
    // Only fetch keys for tokens that claim to be from the issuer
    if (claims.iss !== policy.issuer) {
        return 'invalid';
    }
    const jwk = await signingKey(policy.issuer, headerClaims.kid, now);
    if (!jwk) {
        return 'invalid';
    }
    let isSigned: boolean;
    try {
        const key = await globalThis.crypto.subtle.importKey(
            'jwk',
            jwk,
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
            false,
            ['verify']
        );
        const encoder = new TextEncoder();
        isSigned = await globalThis.crypto.subtle.verify(
            'RSASSA-PKCS1-v1_5',
            key,
            decodeSegment(signature),
            encoder.encode(`${header}.${payload}`)
        );
    } catch {
        return 'invalid';
    }
    const seconds = now / msPerSecond;
    const audiences = Array.isArray(claims.aud) ? (claims.aud as unknown[]) : [claims.aud];
    if (
        !isSigned ||
        !audiences.includes(policy.audience) ||
        typeof claims.exp !== 'number' ||
        claims.exp + clockSkewSeconds < seconds ||
        (typeof claims.nbf === 'number' && claims.nbf - clockSkewSeconds > seconds)
    ) {
        return 'invalid';
    }
    return claims.repository_id === policy.repositoryId &&
        claims.ref === 'refs/heads/main' &&
        claims.event_name === 'push'
        ? 'valid'
        : 'forbidden';
};
