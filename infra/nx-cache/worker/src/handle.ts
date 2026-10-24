import type { TokenCheck, WriterPolicy } from './github-oidc.js';
import { checkToken } from './github-oidc.js';

/**
 * The parts of an R2 bucket the cache uses.
 */
export interface CacheBucket {
    get: (key: string) => Promise<{ body: ReadableStream; size: number; uploaded: Date } | null>;
    head: (key: string) => Promise<{ uploaded: Date } | null>;
    put: (key: string, value: ReadableStream) => Promise<unknown>;
}

/**
 * Bindings and variables of the Worker, set in `wrangler.jsonc`.
 */
export interface Env {
    /**
     * Bucket of task results, keyed by hash.
     */
    readonly cache: CacheBucket;
    /**
     * Days a result is served for, after it was stored. The bucket's lifecycle rule deletes it later.
     */
    readonly maxAgeDays: string;
    /**
     * `aud` of the GitHub Actions OIDC tokens that may write.
     */
    readonly oidcAudience: string;
    /**
     * `iss` of the tokens: GitHub Actions'.
     */
    readonly oidcIssuer: string;
    /**
     * ID of the repository whose pushes to `main` may write.
     */
    readonly repositoryId: string;
}

const statusOk = 200;
const statusUnauthorized = 401;
const statusForbidden = 403;
const statusNotFound = 404;
const statusMethodNotAllowed = 405;
const statusConflict = 409;
const statusLengthRequired = 411;
const statusUnavailable = 503;

const dayMs = 86_400_000;

/**
 * The hash in a cache URL, of Nx's self-hosted remote cache API.
 */
const cachePath = /^\/v1\/cache\/(?<hash>[\w\-]+)$/v;

const status = (code: number, text = ''): Response => new Response(text, { status: code });

/**
 * Whether a result is too old to serve.
 *
 * @param uploaded - when it was stored
 * @param env - the Worker's variables
 * @param now - current time, in milliseconds
 * @returns true if it is older than the maximum age
 */
const isExpired = (uploaded: Date, env: Env, now: number): boolean =>
    now - uploaded.getTime() > Number(env.maxAgeDays) * dayMs;

/**
 * Serve a task result. Anyone may read: results are built from the public repository.
 *
 * `Last-Modified` is when it was stored, so a cache in front of this one can expire it at the same time.
 *
 * @param hash - Nx's hash of the task
 * @param env - the Worker's bindings
 * @param now - current time, in milliseconds
 * @returns the tarball, or 404
 */
const read = async (hash: string, env: Env, now: number): Promise<Response> => {
    const object = await env.cache.get(hash);
    if (!object || isExpired(object.uploaded, env, now)) {
        await object?.body.cancel();
        return status(statusNotFound);
    }
    return new Response(object.body, {
        headers: {
            'content-length': String(object.size),
            'content-type': 'application/octet-stream',
            'last-modified': object.uploaded.toUTCString(),
        },
    });
};

/**
 * Store a task result, if the request is from CI on a push to `main`. The first result stored for a hash is kept.
 *
 * @param hash - Nx's hash of the task
 * @param request - the request, with the tarball as its body
 * @param env - the Worker's bindings
 * @param now - current time, in milliseconds
 * @returns 200 if stored, 409 if already stored, 401 or 403 if it may not write, 411 without a length, and 503 if
 * the token can't be checked
 */
const write = async (hash: string, request: Request, env: Env, now: number): Promise<Response> => {
    const authorization = request.headers.get('authorization') ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';
    const policy: WriterPolicy = {
        audience: env.oidcAudience,
        issuer: env.oidcIssuer,
        repositoryId: env.repositoryId,
    };
    let check: TokenCheck;
    try {
        check = token === '' ? 'invalid' : await checkToken(token, policy, now);
    } catch {
        return status(statusUnavailable, "GitHub's signing keys could not be fetched");
    }
    if (check === 'invalid') {
        return status(statusUnauthorized, 'A GitHub Actions OIDC token is required to write');
    }
    if (check === 'forbidden') {
        return status(statusForbidden, 'Only pushes to main may write');
    }
    // R2 stores a stream only of a known length
    if (!request.body || !request.headers.has('content-length')) {
        return status(statusLengthRequired);
    }
    const existing = await env.cache.head(hash);
    if (existing && !isExpired(existing.uploaded, env, now)) {
        return status(statusConflict);
    }
    await env.cache.put(hash, request.body);
    return status(statusOk);
};

/**
 * Handle a request to the cache: Nx's self-hosted remote cache API, `GET` and `PUT /v1/cache/{hash}`.
 *
 * @param request - a request from Nx, or from a cache server in front of this one
 * @param env - the Worker's bindings
 * @param now - current time, in milliseconds
 * @returns the response
 */
export const handle = async (request: Request, env: Env, now: number): Promise<Response> => {
    const { pathname } = new URL(request.url);
    const hash = cachePath.exec(pathname)?.groups?.hash;
    if (hash === undefined) {
        return status(statusNotFound);
    }
    if (request.method === 'GET') {
        return read(hash, env, now);
    }
    return request.method === 'PUT'
        ? write(hash, request, env, now)
        : status(statusMethodNotAllowed);
};
