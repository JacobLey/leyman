import type { ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:http';
import { expect } from '@leyman/expect';
import { GeneverLoadError } from 'genever';
import { suite, test } from 'mocha-chain';
import { loadReferences } from '#internal/lib/load.js';

suite('fetch timeout', () => {
    /**
     * Load a schema referring to a server that answers each request with `respond`, and never finishes it.
     *
     * @param respond - what the server sends before it stops
     * @returns rejection of the load
     */
    const loadFromStalledServer = async (
        respond: (response: ServerResponse) => void
    ): Promise<unknown> => {
        const server = createServer((_request, response) => {
            respond(response);
        });
        await new Promise<void>(resolve => {
            server.listen(0, '127.0.0.1', resolve);
        });
        const { port } = server.address() as AddressInfo;
        try {
            return await expect(
                loadReferences(
                    { $ref: `http://127.0.0.1:${port}/a.json` },
                    {
                        baseUri: 'file:///input.json',
                        dialect: 'draft-2020-12',
                        fetch: true,
                        fetchTimeout: 50,
                        isDocument: false,
                    }
                )
            ).to.be.rejectedWith(GeneverLoadError, /timed out after 50 ms/v);
        } finally {
            server.closeAllConnections();
            await new Promise(resolve => {
                server.close(resolve);
            });
        }
    };

    test('a server that never answers', async () => {
        const thrown = await loadFromStalledServer(() => {});

        expect(thrown).to.have.property('pointer', '#/$ref');
    });

    test('a body that never ends', async () => {
        await loadFromStalledServer(response => {
            response.writeHead(200, { 'content-type': 'application/json' }).write('{');
        });
    });
});
