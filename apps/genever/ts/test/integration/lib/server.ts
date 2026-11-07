import type { IncomingMessage, ServerResponse } from 'node:http';
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
 * Answers a request for a schema in `test/data/external/remote`, or a 404 when there's none.
 *
 * @param request - Naming the schema by its path
 * @param response - The schema, or a 404
 */
const serve = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = request.url ?? '/';
    const isYaml = url.startsWith('/as-yaml/');
    const name = `${Path.basename(url)}${isYaml ? '.yaml' : ''}`;
    try {
        const body =
            name === ''
                ? '{ "type": "boolean" }'
                : await readFile(Path.join(remoteDirectory, name));
        response
            .writeHead(200, {
                'content-type': isYaml ? 'application/yaml' : 'application/json',
            })
            .end(body);
    } catch {
        response.writeHead(404).end();
    }
};

/**
 * Serve the schemas in `test/data/external/remote` over HTTP, as `application/json`,
 * and a boolean schema at the root path. `/as-yaml/<name>` serves `<name>.yaml` as `application/yaml`,
 * without an extension in its URL.
 *
 * @returns URL of the server, and a function to stop it
 */
export const startSchemaServer = async (): Promise<SchemaServer> => {
    const server = createServer((request, response) => {
        // Answers every request, a missing schema with a 404, so it never rejects
        void serve(request, response);
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
