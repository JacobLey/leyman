/* eslint-disable no-console, n/no-sync -- A script: printing is its output, and it measures one thing at a time */
// Measures where WebAssembly pays off, printing JSON and tables. Never in CI, under 2 minutes in all, and no single
// measurement blocks for over a second: `pnpm bench`
import type { Browser, BrowserType } from 'playwright';
import type { Rolldown } from 'vite';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';
import { build } from 'vite';
import { createHashWorker } from '@leyman/demo-blake3-wasm';
import { loaders } from './hashes.js';
import { coldSizes, hotSizes, makeBytes, measureHot, measureWorker, median } from './measure.js';

const names = Object.keys(loaders) as (keyof typeof loaders)[];
const COLD_RUNS = 5;
const origin = 'https://bench.test/';
const entryFile = 'entry.js';

const milliseconds = (value: number): string =>
    value < 1 ? `${(value * 1000).toFixed(1)} µs` : `${value.toFixed(2)} ms`;

interface Results {
    hot: Record<string, Record<number, number>>;
    cold: Record<string, Record<number, { load: number; first: number }>>;
    worker: Record<string, number>;
}

const print = (where: string, { hot, cold, worker }: Results): void => {
    console.log(`\n## ${where}\n\nWarm, per call:\n`);
    console.table(
        hotSizes.map(size => ({
            bytes: size,
            noble: milliseconds(hot.noble![size]!),
            tight: milliseconds(hot.tight![size]!),
            wasm: milliseconds(hot.wasm![size]!),
            'tight / wasm': (hot.tight![size]! / hot.wasm![size]!).toFixed(2),
        }))
    );
    console.log('Cold, load + first call:');
    console.table(
        coldSizes.map(size => ({
            bytes: size,
            ...Object.fromEntries(
                names.map(name => {
                    const { load, first } = cold[name]![size]!;
                    return [name, `${milliseconds(load + first)} (load ${milliseconds(load)})`];
                })
            ),
        }))
    );
    console.log('Worker:', worker);
};

const medianCold = (runs: readonly { load: number; first: number }[]) => ({
    load: median(runs.map(({ load }) => load)),
    first: median(runs.map(({ first }) => first)),
});

const forEachCold = async (
    measure: (name: keyof typeof loaders, size: number) => Promise<{ load: number; first: number }>
): Promise<Results['cold']> => {
    const cold: Results['cold'] = {};
    for (const name of names) {
        cold[name] = {};
        for (const size of coldSizes) {
            const runs: { load: number; first: number }[] = [];
            for (let i = 0; i < COLD_RUNS; i++) {
                runs.push(await measure(name, size));
            }
            cold[name][size] = medianCold(runs);
        }
    }
    return cold;
};

const inNode = async (): Promise<Results> => ({
    hot: measureHot(
        {
            noble: await loaders.noble(),
            tight: await loaders.tight(),
            wasm: await loaders.wasm(),
        },
        hotSizes
    ),
    cold: await forEachCold(async (name, size) => {
        const output = execFileSync(
            process.execPath,
            // eslint-disable-next-line unicorn/no-missing-local-resource -- Compiled from `node-cold.ts` alongside this file
            [fileURLToPath(new URL('node-cold.js', import.meta.url)), name, String(size)],
            { encoding: 'utf8' }
        );
        return JSON.parse(output) as { load: number; first: number };
    }),
    worker: await measureWorker(
        createHashWorker,
        async (worker, bytes, transfer) => worker.hash(bytes, { transfer }),
        makeBytes(16_777_216)
    ),
});

const buildPage = async (): Promise<Map<string, string | Uint8Array>> => {
    const { output } = (await build({
        configFile: false,
        logLevel: 'silent',
        build: {
            write: false,
            minify: false,
            rolldownOptions: {
                // eslint-disable-next-line unicorn/no-missing-local-resource -- Compiled from `browser-entry.ts` alongside this file
                input: fileURLToPath(new URL('browser-entry.js', import.meta.url)),
                output: { entryFileNames: entryFile },
            },
        },
    })) as Rolldown.RolldownOutput;
    return new Map(
        output.map(file => [file.fileName, file.type === 'chunk' ? file.code : file.source])
    );
};

const openPage = async (browser: Browser, files: ReadonlyMap<string, string | Uint8Array>) => {
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
                      body: typeof file === 'string' ? file : Buffer.from(file),
                  }
        );
    });
    await page.goto(origin);
    await page.waitForFunction(() => 'bench' in globalThis);
    return page;
};

const inBrowser = async (
    browserType: BrowserType,
    files: ReadonlyMap<string, string | Uint8Array>
): Promise<Results> => {
    // eslint-disable-next-line n/no-process-env -- Set by Dagger, to use its Playwright service
    const endpoint = process.env.PW_TEST_CONNECT_WS_ENDPOINT;
    await using browser =
        endpoint === undefined ? await browserType.launch() : await browserType.connect(endpoint);
    const page = await openPage(browser, files);
    const hot = await page.evaluate(async () => globalThis.bench.hot());
    const worker = await page.evaluate(async () => globalThis.bench.worker());
    await page.close();
    const cold = await forEachCold(async (name, size) => {
        const fresh = await openPage(browser, files);
        const result = await fresh.evaluate(
            async args => globalThis.bench.cold(args.name, args.size),
            { name, size }
        );
        await fresh.close();
        return result;
    });
    return { hot, cold, worker };
};

const results: Record<string, Results> = { node: await inNode() };
const files = await buildPage();
for (const browserType of [chromium, firefox, webkit]) {
    results[browserType.name()] = await inBrowser(browserType, files);
}
for (const [where, result] of Object.entries(results)) {
    print(where, result);
}
console.log(`\n${JSON.stringify(results)}`);
