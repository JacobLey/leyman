import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { serve } from '@hono/node-server';

export interface Served {
    readonly url: string;
    /**
     * Serves with this, from now on. Until called, every request is a 503.
     */
    readonly use: (fetch: (request: Request) => Promise<Response> | Response) => void;
    /**
     * Stops listening. Does nothing once stopped, so a test may stop a server early.
     */
    readonly close: () => Promise<void>;
}

/**
 * Listens on a free port before there's anything to serve, so an app can be built knowing its own URL.
 *
 * @returns Where it listens, how to start serving, and how to stop
 */
export const listen = async (): Promise<Served> => {
    let current: (request: Request) => Promise<Response> | Response = request =>
        new Response(`Nothing serves ${request.url} yet`, { status: 503 });
    const server = serve({
        fetch: async request => current(request),
        port: 0,
        hostname: '127.0.0.1',
    });
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    return {
        url: `http://127.0.0.1:${port}`,
        use: fetch => {
            current = fetch;
        },
        close: async () =>
            new Promise((resolve, reject) => {
                if (!server.listening) {
                    resolve();
                    return;
                }
                server.close(error => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
                // Keep-alive connections (e.g. from the MCP server to the API) would hold it open
                (server as { closeAllConnections?: () => void }).closeAllConnections?.();
            }),
    };
};
