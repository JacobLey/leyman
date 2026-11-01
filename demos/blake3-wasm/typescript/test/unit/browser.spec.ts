/* eslint-disable @typescript-eslint/unbound-method -- Stands in for what browsers put on the global object, and restores it */

import type { Endpoint } from 'comlink';
import { MessageChannel } from 'node:worker_threads';
import { wrap } from 'comlink';
import { hash as nodeHash } from '@leyman/demo-blake3-wasm';
import { expect } from '@leyman/expect';
import { before, suite } from 'mocha-chain';

// The bindings are shared, and the Node.js entry point above has already initialized them, as Node.js can't fetch the
// `.wasm` file. The test in `test/integration` runs these same entry points in browsers
suite('Browser entry points', () => {
    const withBrowser = before(async () => ({ browser: await import('#internal/browser.js') }));

    withBrowser.test('Hash', ({ browser }) => {
        expect(browser.hash(new Uint8Array(16))).to.deep.equal(nodeHash(new Uint8Array(16)));
    });

    withBrowser.test('Start a module worker from its own file', async ({ browser }) => {
        const created: { url: URL; options: WorkerOptions; terminated: boolean }[] = [];
        const original: unknown = Reflect.get(globalThis, 'Worker');
        const ignore = (): void => {};
        // eslint-disable-next-line func-names, prefer-arrow-callback, @typescript-eslint/naming-convention -- `new` needs a function, named for the class it stands in for
        Reflect.set(globalThis, 'Worker', function FakeWorker(url: URL, options: WorkerOptions) {
            const worker = { url, options, terminated: false };
            created.push(worker);
            return {
                postMessage: ignore,
                addEventListener: ignore,
                removeEventListener: ignore,
                terminate: () => {
                    worker.terminated = true;
                },
            };
        });
        try {
            const worker = browser.createHashWorker();
            await worker.close();
        } finally {
            Reflect.set(globalThis, 'Worker', original);
        }

        expect(created).to.have.length(1);
        expect(created[0]!.url.href).to.match(/\/worker-browser\.js$/v);
        expect(created[0]!.options).to.deep.equal({ type: 'module' });
        expect(created[0]!.terminated).to.equal(true);
    });

    withBrowser.test('Worker answers over the real protocol', async () => {
        const { port1, port2 } = new MessageChannel();
        const scope = globalThis as unknown as Endpoint;
        const original = { add: scope.addEventListener, post: scope.postMessage };
        // What a worker's global scope is: where messages arrive, and what sends them back
        scope.addEventListener = (type: string, listener: unknown) => {
            port1.on(type, data => {
                (listener as (event: { data: unknown }) => void)({ data });
            });
        };
        scope.postMessage = (message: unknown, transfer: never) => {
            port1.postMessage(message, transfer);
        };
        const remote = wrap<{ hash: (bytes: Uint8Array) => Uint8Array }>({
            addEventListener: (type: string, listener: unknown) => {
                port2.on(type, data => {
                    (listener as (event: { data: unknown }) => void)({ data });
                });
            },
            removeEventListener: () => {},
            postMessage: (message: unknown, transfer: never) => {
                port2.postMessage(message, transfer);
            },
        });
        try {
            await import('#internal/worker-browser.js');
            const bytes = new Uint8Array(16);
            expect(await remote.hash(bytes)).to.deep.equal(nodeHash(bytes));
        } finally {
            scope.addEventListener = original.add;
            scope.postMessage = original.post;
            port1.close();
            port2.close();
        }
    });
});
