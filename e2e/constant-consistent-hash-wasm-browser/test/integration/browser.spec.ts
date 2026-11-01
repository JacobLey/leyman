import type { Context } from 'mocha';
import type { Browser, BrowserType, Page } from 'playwright';
import type { Rolldown } from 'vite';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import { build } from 'vite';
import testVectors from '@leyman/constant-consistent-hash-test-vectors/test-vectors.json' with {
    type: 'json',
};
import { expect } from '@leyman/expect';
import { consistentHash, hashKey } from 'constant-consistent-hash';
import { before, suite } from 'mocha-chain';

const nodeModules = new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`)]);

const origin = 'https://consistent-hash.test/';
const entryFile = 'entry.js';

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

/**
 * Hosts the frontend, intercepted before it reaches the network, and opens it.
 *
 * @param browser - browser to open the page in
 * @param files - what {@link buildFrontend} built
 * @returns the page, with the package loaded as `consistentHashWasm`, and each path it requested
 */
const openPage = async (
    browser: Browser,
    files: ReadonlyMap<string, string | Uint8Array>
): Promise<{ page: Page; requested: string[] }> => {
    const page = await browser.newPage();
    const requested: string[] = [];
    await page.route(`${origin}**`, async route => {
        const { pathname } = new URL(route.request().url());
        const path = pathname.slice(1);
        requested.push(path);
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
    await page.waitForFunction(() => 'consistentHashWasm' in globalThis);
    return { page, requested };
};

suite('constant-consistent-hash through WASM, in the browser', () => {
    const withFrontend = before(async function (this: Context) {
        this.timeout(30_000);
        return { files: await buildFrontend() };
    });

    withFrontend.test('Hosts WASM as its own file', ({ files }) => {
        const wasm = files
            .keys()
            .filter(file => file.endsWith('.wasm'))
            .toArray();
        expect(wasm).to.have.length(1);
        // `\0asm`
        expect([...(files.get(wasm[0]!) as Uint8Array).slice(0, 4)]).to.deep.equal([
            0, 97, 115, 109,
        ]);
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

            const withPage = withBrowser.beforeEach(async ({ browser, files }) =>
                openPage(browser, files)
            );
            withPage.afterEach(async ({ page }) => page.close());

            withPage.test('Fetches the WASM file', ({ requested }) => {
                expect(requested.filter(path => path.endsWith('.wasm'))).to.have.length(1);
            });

            withPage.test('Returns every test vector', async ({ page }) => {
                const results = await page.evaluate(
                    ({ ranges, vectors }) =>
                        vectors.map(({ key, seed }) => ({
                            hash: globalThis.consistentHashWasm.hashKey(key, { seed }),
                            buckets: ranges.map(range =>
                                globalThis.consistentHashWasm.consistentHash(key, range, { seed })
                            ),
                        })),
                    testVectors
                );

                expect(results).to.deep.equal(
                    testVectors.vectors.map(({ hash, buckets }) => ({ hash, buckets }))
                );
            });

            withPage.test(
                'Encodes lone surrogates as the TypeScript implementation',
                async ({ page }) => {
                    const keys = ['\u{D800}', 'a\u{D83D}b', '\u{DE00}\u{D83D}'];
                    const results = await page.evaluate(
                        lone =>
                            lone.map(key => ({
                                hash: globalThis.consistentHashWasm.hashKey(key),
                                bucket: globalThis.consistentHashWasm.consistentHash(key, 2 ** 48),
                            })),
                        keys
                    );

                    expect(results).to.deep.equal(
                        keys.map(key => ({
                            hash: hashKey(key),
                            bucket: consistentHash(key, 2 ** 48),
                        }))
                    );
                }
            );
        });
    }
});
