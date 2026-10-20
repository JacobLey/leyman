import type { AddressInfo } from 'node:net';
import type { Hono } from 'hono';
import { once } from 'node:events';
import { serve } from '@hono/node-server';

export interface Served {
    readonly url: string;
    readonly close: () => Promise<void>;
}

/**
 * Serves the app on a free port, as it would run in production.
 *
 * @param app - Hono app
 * @returns Where it listens, and how to stop it
 */
export const listen = async (app: Hono): Promise<Served> => {
    const server = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' });
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    return {
        url: `http://127.0.0.1:${port}`,
        close: async () =>
            new Promise((resolve, reject) => {
                server.close(error => {
                    error ? reject(error) : resolve();
                });
            }),
    };
};
