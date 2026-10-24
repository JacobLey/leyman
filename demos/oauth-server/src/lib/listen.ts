import type { AddressInfo } from 'node:net';
import type { DevAuthorizationServerOptions } from './provider.js';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { assertLocal, createDevAuthorizationServer } from './provider.js';

/**
 * @import { DevAuthorizationServerNotLocalError } from './errors.js'
 */

export interface ListenOptions extends Omit<DevAuthorizationServerOptions, 'issuer'> {
    /**
     * @default 0, any free port
     */
    readonly port?: number | undefined;
    /**
     * @default '127.0.0.1'
     */
    readonly hostname?: string | undefined;
}

export interface ListeningAuthorizationServer {
    /**
     * Where it listens, which is also its issuer.
     */
    readonly issuer: string;
    readonly close: () => Promise<void>;
}

/**
 * Serves a dev authorization server over HTTP, its issuer being wherever it listens.
 *
 * @param options - As `createDevAuthorizationServer`, plus where to listen
 * @returns Its issuer, and how to stop it
 * @rejects {DevAuthorizationServerNotLocalError} When the hostname isn't this machine, and that wasn't asked for
 */
export const listenDevAuthorizationServer = async (
    options: ListenOptions
): Promise<ListeningAuthorizationServer> => {
    const { port = 0, hostname = '127.0.0.1', ...rest } = options;
    // Before listening, so a server that shouldn't listen never starts
    assertLocal(hostname, rest.dangerouslyAllowNonLocal);
    const server = createServer();
    server.listen(port, hostname);
    await once(server, 'listening');
    const address = server.address() as AddressInfo;
    const { issuer, listener } = await createDevAuthorizationServer({
        ...rest,
        issuer: `http://${hostname}:${address.port}`,
    });
    server.on('request', listener);
    return {
        issuer,
        close: async () =>
            new Promise((resolve, reject) => {
                server.close(error => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve();
                    }
                });
                server.closeAllConnections();
            }),
    };
};
