import type { Context } from 'mocha';
import type { Browser, BrowserType, Page } from 'playwright';
import type { Rolldown } from 'vite';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import { build } from 'vite';
import testVectors from '@leyman/demo-blake3-wasm-rust/test-vectors.json' with { type: 'json' };
import { expect } from '@leyman/expect';
import { before, suite } from 'mocha-chain';

const nodeModules = new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`)]);
const origin = 'https://blake3-wasm.test/';
const entryFile = 'entry.js';
// Takes long enough for a page to do something else meanwhile
const LARGE_INPUT = 64 * 1024 * 1024;

/**
 * Starts a browser: on the Playwright server at `PW_TEST_CONNECT_WS_ENDPOINT` when there is one (CI runs one, with
 * the browsers and their system libraries), else here.
 *
 * @param browserType - browser to start
 * @returns the browser
 */
const launch = async (browserType: BrowserType): Promise<Browser> => {
    // Set by Dagger, which runs the server. Node's `process`: this file's globals are the browser's, for what runs
    // in the page
    const endpoint = globalThis.process.env.PW_TEST_CONNECT_WS_ENDPOINT;
    return endpoint === undefined ? browserType.launch() : browserType.connect(endpoint);
};

/**
 * Builds the frontend as an app would, failing on any import of a Node.js module.
 *
 * @returns content of each file a server would host, by its path
 */
const buildFrontend = async (): Promise<Map<string, string | Uint8Array>> => {
    const { output } = (await build({
        configFile: false,
        logLevel: 'silent',
        plugins: [
            {
                name: 'no-node-modules',
                enforce: 'pre',
                resolveId(id, importer = 'the entry') {
                    if (nodeModules.has(id)) {
                        this.error(`Frontend imports Node.js module ${id} from ${importer}`);
                    }
                },
            },
        ],
        build: {
            write: false,
            minify: false,
            rolldownOptions: {
                // eslint-disable-next-line unicorn/no-missing-local-resource -- Compiled from `entry.ts` alongside this file
                input: fileURLToPath(new URL('../data/entry.js', import.meta.url)),
                output: { entryFileNames: entryFile },
            },
        },
    })) as Rolldown.RolldownOutput;

    return new Map(
        output.map(file => [file.fileName, file.type === 'chunk' ? file.code : file.source])
    );
};

const openPage = async (
    browser: Browser,
    files: ReadonlyMap<string, string | Uint8Array>
): Promise<Page> => {
    const page = await browser.newPage();
    await page.route(`${origin}**`, async route => {
        const { pathname } = new URL(route.request().url());
        const path = pathname.slice(1);
        if (path === '') {
            await route.fulfill({
                contentType: 'text/html',
                body: `<!doctype html><script type="module" src="/${entryFile}"></script>`,
            });
            return;
        }
        const file = files.get(path);
        await route.fulfill(
            file === undefined
                ? { status: 404 }
                : {
                      contentType: path.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
                      body: typeof file === 'string' ? file : globalThis.Buffer.from(file),
                  }
        );
    });
    await page.goto(origin);
    await page.waitForFunction(() => 'blake3Wasm' in globalThis);
    return page;
};

suite('blake3-wasm in the browser', () => {
    const withFrontend = before(async function (this: Context) {
        this.timeout(30_000);
        return { files: await buildFrontend() };
    });

    for (const browserType of [chromium, firefox, webkit] as BrowserType[]) {
        suite(browserType.name(), () => {
            const withBrowser = withFrontend.before(async function (this: Context) {
                this.timeout(30_000);
                return { browser: await launch(browserType) };
            });
            withBrowser.after(async ({ browser }) => {
                // Missing when launching failed, which would otherwise be reported twice
                await (browser as Browser | undefined)?.close();
            });

            const withPage = withBrowser.beforeEach(async ({ browser, files }) => ({
                page: await openPage(browser, files),
            }));
            withPage.afterEach(async ({ page }) => page.close());

            withPage.test(
                'Returns every test vector, on the page and in a worker',
                async ({ page }) => {
                    const results = await page.evaluate(async ({ cases, inputByteCycle }) => {
                        // Not `await using`, which compiles to a helper that isn't on the page
                        const worker = globalThis.blake3Wasm.createHashWorker();
                        const hashes = await Promise.all(
                            cases.map(async ({ inputLength }) => {
                                const input = Uint8Array.from(
                                    { length: inputLength },
                                    (_, i) => i % inputByteCycle
                                );
                                const inWorker = await worker.hash(input);
                                return {
                                    page: globalThis.blake3Wasm.hash(input).toHex(),
                                    worker: inWorker.toHex(),
                                };
                            })
                        );
                        await worker.close();
                        return hashes;
                    }, testVectors);

                    expect(results).to.deep.equal(
                        testVectors.cases.map(({ hash }) => ({ page: hash, worker: hash }))
                    );
                }
            );

            withPage.test('A worker leaves the page free', async ({ page }) => {
                const turns = await page.evaluate(async length => {
                    const worker = globalThis.blake3Wasm.createHashWorker();
                    let count = 0;
                    const interval = globalThis.setInterval(() => {
                        count++;
                    }, 0);
                    await worker.hash(new Uint8Array(length), { transfer: true });
                    globalThis.clearInterval(interval);
                    await worker.close();
                    return count;
                }, LARGE_INPUT);

                expect(turns).to.be.greaterThan(1);
            });

            withPage.test('Transfer moves the bytes, and copying leaves them', async ({ page }) => {
                const lengths = await page.evaluate(async () => {
                    const worker = globalThis.blake3Wasm.createHashWorker();
                    const copied = new Uint8Array(1024);
                    const moved = new Uint8Array(1024);
                    await worker.hash(copied);
                    await worker.hash(moved, { transfer: true });
                    await worker.close();
                    return { copied: copied.length, moved: moved.length };
                });

                expect(lengths).to.deep.equal({ copied: 1024, moved: 0 });
            });
        });
    }
});
