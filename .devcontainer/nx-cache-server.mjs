/**
 * Minimal Nx self-hosted remote cache server.
 *
 * Implements the HTTP contract Nx uses when `NX_SELF_HOSTED_REMOTE_CACHE_SERVER` is set:
 *   GET /v1/cache/{hash} -> 200 tarball | 404
 *   PUT /v1/cache/{hash} -> 200 stored | 409 already exists
 *
 * Every worktree's devcontainer runs its own instance, but all of them point at the same
 * directory, so a task cached in one worktree is a cache hit in every other worktree.
 *
 * Each file is one task result, timestamped when it was stored (reads don't touch it, and
 * actions/cache preserves it in CI). A result older than `NX_CACHE_SERVER_MAX_AGE_DAYS` is never
 * served, and is deleted at startup and every hour after, so the directory doesn't grow forever.
 *
 * With `NX_CACHE_SERVER_UPSTREAM` (the hosted cache, `infra/nx-cache`), it is a tier in front of another
 * cache server:
 * - A result it doesn't have is read from the upstream, and kept, timestamped when the upstream stored it
 *   (its `Last-Modified`), so it expires here when it does there.
 * - Results are only written to the upstream with `NX_CACHE_SERVER_UPSTREAM_WRITE=github-oidc`: in a GitHub
 *   Actions job with `id-token: write`, each upload carries an OIDC token for `NX_CACHE_SERVER_OIDC_AUDIENCE`.
 *   The upstream decides who may write (CI on `main`), so this never needs a secret.
 * - With `NX_CACHE_SERVER_REFRESH_AFTER_DAYS` too, a result it serves that was stored longer ago than that is uploaded
 *   again first, so a result that is still read never expires upstream. The upstream must accept a result that old
 *   being replaced (the hosted cache's `refreshAfterDays`).
 * - The upstream failing is a miss, never an error: Nx runs the task instead.
 *
 * Uses only Node built-ins so it runs before (and independently of) `pnpm install`.
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat, utimes } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const cacheDir = process.env.NX_CACHE_SERVER_DIR ?? '/cache';
const port = Number(process.env.NX_CACHE_SERVER_PORT ?? 3000);
const maxAgeMs = Number(process.env.NX_CACHE_SERVER_MAX_AGE_DAYS ?? 7) * 24 * 60 * 60 * 1000;
const sweepIntervalMs = 60 * 60 * 1000;
const hashPattern = /^\/v1\/cache\/(?<hash>[\w\-]+)$/v;
// Without a trailing slash, so `${upstream}/v1/...` is one
const upstream = process.env.NX_CACHE_SERVER_UPSTREAM?.replace(/\/+$/v, '') || null;
const writesUpstream = upstream !== null && process.env.NX_CACHE_SERVER_UPSTREAM_WRITE === 'github-oidc';
const oidcAudience = process.env.NX_CACHE_SERVER_OIDC_AUDIENCE ?? 'leyman-nx-cache';
const refreshAfterMs =
    writesUpstream && process.env.NX_CACHE_SERVER_REFRESH_AFTER_DAYS
        ? Number(process.env.NX_CACHE_SERVER_REFRESH_AFTER_DAYS) * 24 * 60 * 60 * 1000
        : null;
// Reading a result is quick, but a large one uploads for a while
const upstreamReadTimeoutMs = 60 * 1000;
const upstreamWriteTimeoutMs = 5 * 60 * 1000;

if (writesUpstream && !process.env.ACTIONS_ID_TOKEN_REQUEST_URL) {
    throw new Error(
        'NX_CACHE_SERVER_UPSTREAM_WRITE=github-oidc needs a GitHub Actions job with `id-token: write`'
    );
}

await mkdir(cacheDir, { recursive: true });

const isExpired = ({ mtimeMs }) => Date.now() - mtimeMs > maxAgeMs;

// An expired result counts as missing, so it is replaced rather than served
const isFresh = async path => {
    try {
        return !isExpired(await stat(path));
    } catch {
        return false;
    }
};

// Also removes temp files left by an interrupted write. Other worktrees' servers sweep the same
// directory, so a file may already be gone.
const sweep = async () => {
    let expired = 0;
    for (const name of await readdir(cacheDir)) {
        const path = join(cacheDir, name);
        try {
            if (isExpired(await stat(path))) {
                await rm(path, { force: true });
                expired++;
            }
        } catch (err) {
            if (err.code !== 'ENOENT') {
                console.error(`Expiring ${name} failed`, err);
            }
        }
    }
    console.log(`Expired results: ${expired}`);
};

/**
 * Write a stream to a file, through a unique temp file then a rename, so concurrent writers (other worktrees)
 * never observe a partial artifact.
 */
const writeAtomically = async (file, stream, storedAt) => {
    const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random()}.tmp`;
    try {
        await pipeline(stream, createWriteStream(tmp));
        if (storedAt) {
            await utimes(tmp, storedAt, storedAt);
        }
        await rename(tmp, file);
    } finally {
        await rm(tmp, { force: true });
    }
};

/**
 * Copy a result from the upstream into the cache directory.
 *
 * @returns whether the upstream had a fresh result
 */
const readUpstream = async (hash, file) => {
    try {
        const response = await fetch(`${upstream}/v1/cache/${hash}`, {
            signal: AbortSignal.timeout(upstreamReadTimeoutMs),
        });
        if (response.status !== 200 || !response.body) {
            await response.body?.cancel();
            if (response.status !== 404) {
                console.error(`Reading ${hash} from upstream failed: HTTP ${response.status}`);
            }
            return false;
        }
        const lastModified = Date.parse(response.headers.get('last-modified') ?? '');
        const storedAt = Number.isNaN(lastModified) ? null : new Date(lastModified);
        await writeAtomically(file, Readable.fromWeb(response.body), storedAt);
        return isFresh(file);
    } catch (err) {
        console.error(`Reading ${hash} from upstream failed`, err);
        return false;
    }
};

/**
 * A GitHub Actions OIDC token for the upstream, reused until a minute before it expires (they only last minutes,
 * and a CI run writes for longer).
 */
let oidcToken = null;
const getOidcToken = async () => {
    if (oidcToken && oidcToken.expiresAt - 60 * 1000 > Date.now()) {
        return oidcToken.value;
    }
    const url = new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
    url.searchParams.set('audience', oidcAudience);
    const response = await fetch(url, {
        headers: { authorization: `bearer ${process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
        signal: AbortSignal.timeout(upstreamReadTimeoutMs),
    });
    if (!response.ok) {
        throw new Error(`Requesting an OIDC token failed: HTTP ${response.status}`);
    }
    const { value } = await response.json();
    const { exp } = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString());
    oidcToken = { expiresAt: exp * 1000, value };
    return value;
};

/**
 * Upload a stored result to the upstream. A result it already has (409) is fine.
 *
 * @returns whether the upstream stored it
 */
const writeUpstream = async (hash, file) => {
    try {
        const { size } = await stat(file);
        const response = await fetch(`${upstream}/v1/cache/${hash}`, {
            method: 'PUT',
            body: Readable.toWeb(createReadStream(file)),
            duplex: 'half',
            headers: {
                authorization: `Bearer ${await getOidcToken()}`,
                'content-length': String(size),
                'content-type': 'application/octet-stream',
            },
            signal: AbortSignal.timeout(upstreamWriteTimeoutMs),
        });
        // Read rather than cancelled: it's short, and cancelling breaks the connection mid-response
        const text = await response.text();
        if (response.status !== 200 && response.status !== 409) {
            console.error(`Writing ${hash} upstream failed: HTTP ${response.status} ${text}`);
        }
        return response.status === 200;
    } catch (err) {
        console.error(`Writing ${hash} upstream failed`, err);
        return false;
    }
};

/**
 * Upload a result again if it was stored more than `refreshAfterMs` ago, and restamp it once the upstream has it.
 * A 409 (the upstream's copy is newer than this one's timestamp) leaves it for the next read.
 */
const refreshUpstream = async (hash, file) => {
    try {
        if (Date.now() - (await stat(file)).mtimeMs <= refreshAfterMs) {
            return;
        }
        if (await writeUpstream(hash, file)) {
            const now = new Date();
            await utimes(file, now, now);
            console.log(`Refreshed ${hash} upstream`);
        }
    } catch (err) {
        console.error(`Refreshing ${hash} upstream failed`, err);
    }
};

const server = createServer(async (req, res) => {
    // Never reuse connections: Dagger's host service tunnel (CI) doesn't forward the server closing an
    // idle keep-alive connection, so Nx would send its next request into a dead socket and hang forever.
    res.setHeader('connection', 'close');
    const hash = hashPattern.exec(req.url ?? '')?.groups?.hash;
    if (!hash) {
        res.writeHead(404).end();
        return;
    }
    const file = join(cacheDir, `${hash}.tar`);

    try {
        if (req.method === 'GET') {
            if (!(await isFresh(file)) && !(upstream && (await readUpstream(hash, file)))) {
                res.writeHead(404).end();
                return;
            }
            // Before responding, like a write, so the upload is done by the time Nx finishes
            if (refreshAfterMs !== null) {
                await refreshUpstream(hash, file);
            }
            res.writeHead(200, { 'content-type': 'application/octet-stream' });
            await pipeline(createReadStream(file), res);
        } else if (req.method === 'PUT') {
            if (await isFresh(file)) {
                req.resume();
                res.writeHead(409).end();
                return;
            }
            await writeAtomically(file, req, null);
            // Before responding, so the upload is done by the time Nx finishes (and CI ends the job)
            if (writesUpstream) {
                await writeUpstream(hash, file);
            }
            res.writeHead(200).end();
        } else {
            res.writeHead(405).end();
        }
    } catch (err) {
        console.error(`${req.method} ${hash} failed`, err);
        if (res.headersSent) {
            res.destroy();
        } else {
            res.writeHead(500).end();
        }
    }
});

await sweep();
setInterval(() => {
    sweep().catch(err => console.error('Expiring results failed', err));
}, sweepIntervalMs);

server.listen(port, () => {
    const writing = refreshAfterMs === null ? ' (writing to it)' : ' (writing to it, and refreshing results)';
    const tier = upstream ? `, in front of ${upstream}${writesUpstream ? writing : ''}` : '';
    console.log(`Nx cache server listening on :${port}, storing in ${cacheDir}${tier}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
