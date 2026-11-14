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
     * Where to listen, as in a URL: an IPv6 address in brackets (`[::1]`), which it's also accepted without.
     *
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
    // `listen` takes an IPv6 address bare, while a URL needs it in brackets (RFC 3986 §3.2.2)
    const address = /^\[(?<bare>.*)\]$/v.exec(hostname)?.groups?.bare ?? hostname;
    const host = address.includes(':') ? `[${address}]` : address;
    // Before listening, so a server that shouldn't listen never starts
    assertLocal(host, rest.dangerouslyAllowNonLocal);
    const server = createServer();
    server.listen(port, address);
    await once(server, 'listening');
    const { port: listening } = server.address() as AddressInfo;
    const { issuer, listener } = await createDevAuthorizationServer({
        ...rest,
        issuer: `http://${host}:${listening}`,
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
