import { FieldEncoder } from './encoding.js';

/**
 * What identifies a key: the caller, the operation, and the key it sent.
 */
export interface IdentityInput {
    /**
     * Who is calling: a user or tenant id, so one caller's key never touches another's.
     */
    readonly scope: string;
    /**
     * Which operation the request is for, e.g. an OpenAPI `operationId`. With one, the same key on another
     * operation is another key. Without one, a key is one key across everything the scope calls.
     */
    readonly operation?: string;
    /**
     * The key the request sent.
     */
    readonly key: string;
}

/**
 * What a reused key must match.
 */
export interface FingerprintInput {
    /**
     * As received. `DELETE`, `GET`, `HEAD`, `OPTIONS`, `POST` and `PUT` are upper-cased in any case, as `fetch` does;
     * other methods are case-sensitive.
     */
    readonly method: string;
    /**
     * Path and query exactly as received (`/notes?draft=1`), not decoded or normalized.
     */
    readonly target: string;
    /**
     * The request's headers as `[name, value]` pairs, in the order received. A `Headers` object fits as is.
     */
    readonly headers: Iterable<readonly [string, string]>;
    /**
     * Names of the headers that are part of the fingerprint, in any case and order.
     */
    readonly named: readonly string[];
    /**
     * Raw body: bytes, or a string as UTF-8. Empty for a request without one.
     */
    readonly body: string | Uint8Array;
}

/**
 * The methods `fetch` upper-cases in any case when it builds a `Request`
 * ([Fetch, normalize a method](https://fetch.spec.whatwg.org/#concept-method-normalize)). Other methods are
 * case-sensitive, as in HTTP.
 */
const normalizedMethods: ReadonlySet<string> = new Set([
    'DELETE',
    'GET',
    'HEAD',
    'OPTIONS',
    'POST',
    'PUT',
]);

/**
 * Normalizes a method as `fetch` does, so a server that gets the method as received hashes it the same.
 *
 * @param method - Method as received
 * @returns The method, upper-cased if `fetch` would
 */
const normalizeMethod = (method: string): string => {
    const upper = method.toUpperCase();
    return normalizedMethods.has(upper) ? upper : method;
};

/**
 * Hashes a key's identity, as the spec's `identity`.
 *
 * @param input - Scope, operation and key
 * @returns SHA-256, as 64 lower-case hex characters
 */
export const computeIdentity = async ({
    scope,
    operation,
    key,
}: IdentityInput): Promise<string> => {
    const encoder = new FieldEncoder();
    return encoder
        .field(scope)
        .field(operation ?? null)
        .field(key)
        .sha256();
};

/**
 * Hashes a request's fingerprint, as the spec's `fingerprint`.
 *
 * @param input - Method, target, headers and body
 * @returns SHA-256, as 64 lower-case hex characters
 */
export const computeFingerprint = async ({
    method,
    target,
    headers,
    named,
    body,
}: FingerprintInput): Promise<string> => {
    // In byte order (names are ASCII, where UTF-16 order is byte order), never by locale
    // eslint-disable-next-line unicorn/prefer-simple-sort-comparator -- Its suggestion, `a - b`, only sorts numbers
    const names = [...new Set(named.map(name => name.toLowerCase()))].toSorted((a, b) =>
        a < b ? -1 : 1
    );
    const values = new Map<string, string[]>(names.map(name => [name, []]));
    for (const [name, value] of headers) {
        values.get(name.toLowerCase())?.push(value);
    }

    const encoder = new FieldEncoder();
    encoder.field(normalizeMethod(method)).field(target).uint32(names.length);
    for (const name of names) {
        const list = values.get(name)!;
        encoder.field(name).field(list.length === 0 ? null : list.join(', '));
    }
    return encoder.field(body).sha256();
};
