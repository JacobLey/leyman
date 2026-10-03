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
 * Uses only Node built-ins so it runs before (and independently of) `pnpm install`.
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const cacheDir = process.env.NX_CACHE_SERVER_DIR ?? '/cache';
const port = Number(process.env.NX_CACHE_SERVER_PORT ?? 3000);
const hashPattern = /^\/v1\/cache\/(?<hash>[\w-]+)$/u;

await mkdir(cacheDir, { recursive: true });

const exists = async path => {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
};

const server = createServer(async (req, res) => {
    const hash = hashPattern.exec(req.url ?? '')?.groups?.hash;
    if (!hash) {
        res.writeHead(404).end();
        return;
    }
    const file = join(cacheDir, `${hash}.tar`);

    try {
        if (req.method === 'GET') {
            if (!(await exists(file))) {
                res.writeHead(404).end();
                return;
            }
            res.writeHead(200, { 'content-type': 'application/octet-stream' });
            await pipeline(createReadStream(file), res);
        } else if (req.method === 'PUT') {
            if (await exists(file)) {
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

server.listen(port, () => {
    console.log(`Nx cache server listening on :${port}, storing in ${cacheDir}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
