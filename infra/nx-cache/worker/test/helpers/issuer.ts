import type { KeyObject } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { generateKeyPair, randomUUID, sign } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { promisify } from 'node:util';

/**
 * A stand-in for GitHub Actions' OIDC issuer: serves its signing keys, and signs tokens like GitHub's.
 */
export interface Issuer {
    /**
     * `iss` of its tokens, where its keys are served (`<url>/.well-known/jwks`).
     */
    readonly url: string;
    /**
     * Requests for its keys so far.
     */
    readonly keyRequests: () => number;
    /**
     * Sign a token.
     *
     * @param claims - claims, added to (or replacing) those of a push to `main`
     * @param options - how to sign it
     * @param options.header - header fields, added to (or replacing) `alg` and `kid`
     * @param options.untrusted - sign with a key it doesn't serve, under the served key's ID
     * @returns the JWT
     */
    readonly sign: (
        claims?: Readonly<Record<string, unknown>>,
        options?: { header?: Readonly<Record<string, unknown>>; untrusted?: boolean }
    ) => string;
    /**
     * Replace its key with a new one, of a new ID, as GitHub does from time to time.
     */
    readonly rotate: () => Promise<void>;
    /**
     * Serve, under an ID, a key that can't be imported.
     *
     * @param kid - ID of the key
     */
    readonly serveBrokenKey: (kid: string) => void;
    /**
     * Answer requests for its keys with HTTP 500.
     */
    readonly fail: () => void;
    readonly close: () => Promise<void>;
}

/**
 * Audience and repository the test Worker expects.
 */
export const audience = 'test-nx-cache';
export const repositoryId = '1234';

const base64url = (value: string | Uint8Array): string =>
    globalThis.Buffer.from(value).toString('base64url');

const generateRsaKeyPair = promisify(generateKeyPair);

/**
 * Start an issuer, on a free port.
 *
 * @returns the issuer, serving one signing key
 */
export const startIssuer = async (): Promise<Issuer> => {
    const newKey = async (): Promise<{
        kid: string;
        privateKey: KeyObject;
        publicKey: KeyObject;
    }> => ({
        ...(await generateRsaKeyPair('rsa', { modulusLength: 2048 })),
        kid: randomUUID(),
    });
    let key = await newKey();
    const { privateKey: untrustedKey } = await newKey();
    let brokenKeys: string[] = [];
    let isFailing = false;
    let keyRequests = 0;

    const server = createServer((request, response) => {
        if (request.url !== '/.well-known/jwks') {
            response.writeHead(404).end();
            return;
        }
        keyRequests++;
        if (isFailing) {
            response.writeHead(500).end();
            return;
        }
        const keys = [
            { ...key.publicKey.export({ format: 'jwk' }), alg: 'RS256', kid: key.kid, use: 'sig' },
            ...brokenKeys.map(kid => ({ kid, alg: 'RS256', kty: 'RSA', n: 'broken', use: 'sig' })),
        ];
        response
            .writeHead(200, { 'content-type': 'application/json' })
            .end(JSON.stringify({ keys }));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    return {
        keyRequests: () => keyRequests,
        sign: (claims = {}, { header = {}, untrusted = false } = {}) => {
            const seconds = Math.floor(Date.now() / 1000);
            const encodedHeader = base64url(
                JSON.stringify({ alg: 'RS256', kid: key.kid, ...header })
            );
            const payload = base64url(
                JSON.stringify({
                    aud: audience,
                    event_name: 'push',
                    exp: seconds + 300,
                    iat: seconds,
                    iss: url,
                    nbf: seconds,
                    ref: 'refs/heads/main',
                    repository: 'JacobLey/leyman',
                    repository_id: repositoryId,
                    ...claims,
                })
            );
            const signature = sign(
                'sha256',
                globalThis.Buffer.from(`${encodedHeader}.${payload}`),
                untrusted ? untrustedKey : key.privateKey
            );
            return `${encodedHeader}.${payload}.${base64url(signature)}`;
        },
        rotate: async () => {
            key = await newKey();
        },
        serveBrokenKey: kid => {
            brokenKeys = [...brokenKeys, kid];
        },
        fail: () => {
            isFailing = true;
        },
        close: async () => {
            server.close();
            await once(server, 'close');
        },
        url,
    };
};
