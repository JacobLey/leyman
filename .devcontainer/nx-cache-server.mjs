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
 * Uses only Node built-ins so it runs before (and independently of) `pnpm install`.
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const cacheDir = process.env.NX_CACHE_SERVER_DIR ?? '/cache';
const port = Number(process.env.NX_CACHE_SERVER_PORT ?? 3000);
const maxAgeMs = Number(process.env.NX_CACHE_SERVER_MAX_AGE_DAYS ?? 7) * 24 * 60 * 60 * 1000;
const sweepIntervalMs = 60 * 60 * 1000;
const hashPattern = /^\/v1\/cache\/(?<hash>[\w\-]+)$/v;

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
            if (!(await isFresh(file))) {
                res.writeHead(404).end();
                return;
            }
            res.writeHead(200, { 'content-type': 'application/octet-stream' });
            await pipeline(createReadStream(file), res);
        } else if (req.method === 'PUT') {
            if (await isFresh(file)) {
                req.resume();
                res.writeHead(409).end();
                return;
            }
            // Write to a unique temp file then rename, so concurrent writers
            // (other worktrees) never observe a partial artifact.
            const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
            try {
                await pipeline(req, createWriteStream(tmp));
                await rename(tmp, file);
            } finally {
                await rm(tmp, { force: true });
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
    console.log(`Nx cache server listening on :${port}, storing in ${cacheDir}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
