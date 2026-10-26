import type { AddressInfo } from 'node:net';
import type { Context } from 'mocha';
import type { ViteDevServer } from 'vite';
import { request } from 'node:http';
import { createServer, mergeConfig } from 'vite';
import { createViteConfig } from '@leyman/demo-local-ingress';
import { expect } from '@leyman/expect';
import { before, suite } from 'mocha-chain';

const packageRoot = new URL('../../', import.meta.url);

/**
 * A GET as the ingress sends it: to the container's port, with the browser's `Host`.
 *
 * @param port - the dev server's port
 * @param path - the path to request
 * @param host - the `Host` header
 * @returns the status and body
 */
const get = async (
    port: number,
    path: string,
    host: string
): Promise<{ status: number | undefined; body: string }> =>
    new Promise((resolve, reject) => {
        request({ port, path, headers: { host } }, response => {
            const chunks: Buffer[] = [];
            response.on('data', (chunk: Buffer) => {
                chunks.push(chunk);
            });
            response.on('end', () => {
                resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() });
            });
        })
            .on('error', reject)
            .end();
    });

suite('dev server', () => {
    const withServer = before(async function (this: Context) {
        this.timeout(30_000);
        const server: ViteDevServer = await createServer(
            mergeConfig(
                createViteConfig({
                    worktree: 'feat-x',
                    repo: 'leyman',
                    tunnelHost: 'demo.ngrok.app',
                }),
                // Any free port, as tests run beside `dev` and other worktrees' tests on the same machine
                {
                    root: packageRoot.pathname,
                    configFile: false,
                    server: { port: 0, host: '127.0.0.1' },
                }
            )
        );
        await server.listen();
        return { server, port: (server.httpServer?.address() as AddressInfo).port };
    });

    withServer.after(async ({ server }) => {
        await server.close();
    });

    withServer.test('Serves the page with both names', async ({ port }) => {
        const { status, body } = await get(port, '/', 'feat-x.leyman.localhost');
        expect(status).to.equal(200);
        expect(body).to.include('<meta name="worktree" content="feat-x">');
        expect(body).to.include('<meta name="repo" content="leyman">');
    });

    withServer.test('Compiles the entry from src', async ({ port }) => {
        const { status, body } = await get(port, '/src/main.ts', 'feat-x.leyman.localhost');
        expect(status).to.equal(200);
        expect(body).to.include('renderGreeting(globalThis.document)');
    });

    withServer.test("Hot reload connects to the page's own host and port", async ({ port }) => {
        const { body } = await get(port, '/@vite/client', 'feat-x.leyman.localhost');
        // No port of its own, so the client falls back to the page's: the ingress's 443, or its override
        expect(body).to.include('const hmrPort = null;');
        expect(body).to.include('hmrPort || importMetaUrl.port');
    });

    withServer.test('Accepts the tunnel host', async ({ port }) => {
        const { status } = await get(port, '/', 'demo.ngrok.app');
        expect(status).to.equal(200);
    });

    withServer.test('Refuses other hosts', async ({ port }) => {
        const { status } = await get(port, '/', 'evil.example');
        expect(status).to.equal(403);
    });
});
