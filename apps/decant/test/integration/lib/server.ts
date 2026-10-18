import type { AddressInfo } from 'node:net';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import Path from 'node:path';

const remoteDirectory = Path.join(import.meta.dirname, '../../../test/data/external/remote');

export interface SchemaServer {
    close: () => Promise<void>;
    url: string;
}

/**
 * Serve the schemas in `test/data/external/remote` over HTTP, as `application/json`,
 * and a boolean schema at the root path.
 *
 * @returns URL of the server, and a function to stop it
 */
export const startSchemaServer = async (): Promise<SchemaServer> => {
    const server = createServer(async (request, response) => {
        const name = Path.basename(request.url ?? '/');
        try {
            const body =
                name === ''
                    ? '{ "type": "boolean" }'
                    : await readFile(Path.join(remoteDirectory, name));
            response.writeHead(200, { 'content-type': 'application/json' }).end(body);
        } catch {
            response.writeHead(404).end();
        }
    });
    await new Promise<void>(resolve => {
        server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as AddressInfo;
    return {
        close: async () =>
            new Promise<void>(resolve => {
                server.close(() => {
                    resolve();
                });
            }),
        url: `http://127.0.0.1:${port}`,
    };
};
