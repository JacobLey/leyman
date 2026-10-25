import type { Context } from 'mocha';
import type { Browser, BrowserType, Page } from 'playwright';
import type { Rolldown } from 'vite';
import type * as UnknownError from 'unknown-error';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import { build } from 'vite';
import { expect } from '@leyman/expect';
import { before, suite } from 'mocha-chain';

declare global {
    /**
     * Browser build of unknown-error, assigned by the bundle.
     */
    var unknownError: typeof UnknownError;
}

const nodeModules = new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`)]);

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
 * Bundles unknown-error as a browser app would, failing on any import of a Node.js module.
 *
 * @returns bundled script, which assigns unknown-error to `unknownError`
 */
const bundleForBrowser = async (): Promise<string> => {
    const output = (await build({
        configFile: false,
        logLevel: 'silent',
        plugins: [
            {
                name: 'no-node-modules',
                enforce: 'pre',
                resolveId(id, importer = 'the entry') {
                    if (nodeModules.has(id)) {
                        this.error(`Browser build imports Node.js module ${id} from ${importer}`);
                    }
                },
            },
        ],
        build: {
            write: false,
            minify: false,
            lib: {
                // eslint-disable-next-line unicorn/no-missing-local-resource -- Compiled from `entry.ts` alongside this file
                entry: fileURLToPath(new URL('../data/entry.js', import.meta.url)),
                formats: ['iife'],
                name: 'unknownError',
            },
        },
    })) as Rolldown.RolldownOutput[];

    return output[0]!.output[0].code;
};

/**
 * Runs in every frame before its scripts, removing `Error.isError` as in older browsers.
 */
const removeIsError = (): void => {
    Reflect.deleteProperty(Error, 'isError');
};

/**
 * Served from a URL intercepted before it reaches the network, since init scripts only run when the
 * page navigates (not for `setContent` on the initial blank page).
 */
const origin = 'https://unknown-error.test/';

/**
 * Opens a blank page with the bundle loaded.
 *
 * @param browser - browser to open the page in
 * @param code - bundled script
 * @param shouldRemoveIsError - whether to remove `Error.isError` first
 * @returns page, with unknown-error as `unknownError`
 */
const openPage = async (
    browser: Browser,
    code: string,
    shouldRemoveIsError: boolean
): Promise<Page> => {
    const page = await browser.newPage();
    if (shouldRemoveIsError) {
        await page.addInitScript(removeIsError);
    }
    await page.route(origin, async route =>
        route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' })
    );
    await page.goto(origin);
    await page.addScriptTag({ content: code });
    return page;
};

const modes = [
    { name: 'with Error.isError as shipped', shouldRemoveIsError: false },
    { name: 'without Error.isError', shouldRemoveIsError: true },
] as const;

suite('unknown-error in the browser', () => {
    const withBundle = before(async function (this: Context) {
        this.timeout(30_000);
        return { code: await bundleForBrowser() };
    });

    for (const browserType of [chromium, firefox, webkit] as BrowserType[]) {
        suite(browserType.name(), () => {
            const withBrowser = withBundle.before(async function (this: Context) {
                this.timeout(30_000);
                return { browser: await launch(browserType) };
            });
            withBrowser.after(async ({ browser }) => {
                // Missing when launching failed, which would otherwise be reported twice
                await (browser as Browser | undefined)?.close();
            });

            for (const { name, shouldRemoveIsError } of modes) {
                suite(name, () => {
                    const withPage = withBrowser.beforeEach(async ({ browser, code }) => ({
                        page: await openPage(browser, code, shouldRemoveIsError),
                    }));
                    withPage.afterEach(async ({ page }) => page.close());

                    if (shouldRemoveIsError) {
                        withPage.test('Error.isError is removed', async ({ page }) => {
                            expect(
                                await page.evaluate(() => typeof Error.isError === 'function')
                            ).to.equal(false);
                        });
                    }

                    withPage.test('Converts thrown values without throwing', async ({ page }) => {
                        const converted = await page.evaluate(() => {
                            const { toError } = globalThis.unknownError;
                            const error = new TypeError('real');
                            const hostile = new Proxy(
                                {},
                                {
                                    get: () => {
                                        throw new Error('get');
                                    },
                                    getPrototypeOf: () => {
                                        throw new Error('getPrototypeOf');
                                    },
                                    ownKeys: () => {
                                        throw new Error('ownKeys');
                                    },
                                }
                            );
                            const circular: Record<string, unknown> = { id: 7 };
                            circular.self = circular;
                            return {
                                isSame: toError(error) === error,
                                string: toError('boom').message,
                                hostile: toError(hostile).message,
                                circular: toError(circular).message,
                                errorLike: toError({ name: 'HttpError', message: 'Not found' })
                                    .name,
                            };
                        });

                        expect(converted).to.deep.equal({
                            isSame: true,
                            string: 'boom',
                            hostile: '[unprintable value]',
                            circular: '{"id":7,"self":"[Circular]"}',
                            errorLike: 'HttpError',
                        });
                    });

                    withPage.test('Recognizes Errors from an iframe', async ({ page }) => {
                        const result = await page.evaluate(() => {
                            const { getErrorMessage, hasCode, toError } = globalThis.unknownError;
                            const frame = globalThis.document.createElement('iframe');
                            globalThis.document.body.append(frame);
                            const frameWindow = frame.contentWindow as unknown as typeof globalThis;
                            const error = Object.assign(
                                new frameWindow.TypeError('from the frame'),
                                {
                                    code: 'E_FRAME',
                                }
                            );
                            return {
                                // eslint-disable-next-line unicorn/prefer-error-is-error -- showing it's from another realm
                                isForeign: !(error instanceof Error),
                                isSame: toError(error) === error,
                                message: getErrorMessage(error),
                                hasCode: hasCode(error, 'E_FRAME'),
                            };
                        });

                        expect(result).to.deep.equal({
                            isForeign: true,
                            isSame: true,
                            message: 'from the frame',
                            hasCode: true,
                        });
                    });

                    withPage.test('Formats cause chains and AggregateErrors', async ({ page }) => {
                        const lines = await page.evaluate(() => {
                            const error = new AggregateError([new Error('a'), 'b'], 'all', {
                                cause: new Error('why'),
                            });
                            return (
                                globalThis.unknownError
                                    .formatError(error)
                                    .split('\n')
                                    // Drop stack frames: `at …` in Chromium, `name@url` in Firefox and WebKit
                                    .filter(
                                        line =>
                                            !/^\s*at /v.test(line) &&
                                            !line.includes('@') &&
                                            !line.includes('[native code]')
                                    )
                            );
                        });

                        // Firefox and Safari stacks have no `Name: message` line, so it's added
                        expect(lines.filter(line => line.trim() !== '')).to.deep.equal([
                            'AggregateError: all',
                            '    Caused by: Error: why',
                            '    - Error: a',
                            '    - NonError: b',
                        ]);
                    });

                    withPage.test('Ends deep and circular cause chains', async ({ page }) => {
                        const counts = await page.evaluate(() => {
                            const { walkErrors } = globalThis.unknownError;
                            let deep = new Error('leaf');
                            for (let i = 0; i < 100_000; i++) {
                                deep = new Error(`e${i}`, { cause: deep });
                            }
                            const a = new Error('a');
                            Object.defineProperty(a, 'cause', {
                                value: new Error('b', { cause: a }),
                            });
                            return {
                                deep: [...walkErrors(deep, { maxDepth: Number.POSITIVE_INFINITY })]
                                    .length,
                                circular: [...walkErrors(a)].length,
                            };
                        });

                        expect(counts).to.deep.equal({ deep: 100_001, circular: 2 });
                    });
                });
            }
        });
    }
});
