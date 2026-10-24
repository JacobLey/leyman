import type { CacheBucket, Env } from '@leyman/nx-cache-worker';
import { randomUUID } from 'node:crypto';
import Path from 'node:path';
import { Miniflare } from 'miniflare';
import { audience, repositoryId } from './issuer.js';

/**
 * The built Worker, which `wrangler deploy` bundles.
 */
const scriptPath = Path.join(import.meta.dirname, '../../dist/worker.js');

/**
 * Run the Worker on workerd, the runtime Cloudflare runs it on, with an R2 bucket of its own (in memory).
 *
 * @param issuer - URL of the OIDC issuer whose tokens may write
 * @returns Miniflare, and the Worker's bindings, whose bucket is the same one, reached from Node
 */
export const startWorker = async (issuer: string): Promise<{ env: Env; miniflare: Miniflare }> => {
    const vars = {
        maxAgeDays: '7',
        oidcAudience: audience,
        oidcIssuer: issuer,
        repositoryId,
    };
    const miniflare = new Miniflare({
        bindings: vars,
        // The same as `wrangler.jsonc`'s
        compatibilityDate: '2026-08-06',
        modules: true,
        modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }],
        r2Buckets: ['cache'],
        scriptPath,
    });
    await miniflare.ready;
    const r2 = (await miniflare.getR2Bucket('cache')) as unknown as CacheBucket & {
        put: (key: string, value: ArrayBuffer) => Promise<unknown>;
    };
    const bucket: CacheBucket = {
        get: async key => r2.get(key),
        head: async key => r2.head(key),
        // In workerd, a request's body has a known length, which R2 needs to store a stream. A stream made in Node
        // never does, so it is read first. The Worker on workerd stores the stream itself (`runs on workerd`)
        put: async (key, value) => {
            const response = new Response(value);
            return r2.put(key, await response.arrayBuffer());
        },
    };
    return { env: { ...vars, cache: bucket }, miniflare };
};

/**
 * Tests share a bucket, so each uses hashes no other test does.
 *
 * @returns a hash, as Nx's are: digits only
 */
export const uniqueHash = (): string => BigInt(`0x${randomUUID().replaceAll('-', '')}`).toString();
