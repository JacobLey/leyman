import type { Env } from './handle.js';
import { handle } from './handle.js';

export type { CacheBucket, Env } from './handle.js';

/**
 * The Worker: Nx's self-hosted remote cache API on R2.
 */
export default {
    fetch: async (request: Request, env: Env): Promise<Response> =>
        handle(request, env, Date.now()),
};
