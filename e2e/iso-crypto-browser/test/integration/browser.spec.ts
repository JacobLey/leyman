import type { Context } from 'mocha';
import type { Browser, BrowserType, Page } from 'playwright';
import type { Rolldown } from 'vite';
import { createCipheriv } from 'node:crypto';
import { builtinModules } from 'node:module';
import { chromium, firefox, webkit } from 'playwright';
import { build } from 'vite';
import { expect } from '@leyman/expect';
import * as NodeIsoCrypto from 'iso-crypto';
import { before, suite } from 'mocha-chain';

declare global {
    /**
     * Browser build of iso-crypto, assigned by the bundle.
     */
    var isoCrypto: typeof NodeIsoCrypto;
    /**
     * Web Crypto methods called by the page, see {@link trackWebCrypto}.
     */
    var webCryptoCalls: Set<string>;
}

const nodeModules = new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`)]);

/**
 * Bundles iso-crypto as a browser app would, failing on any import of a Node.js module.
 *
 * @returns bundled script, which assigns iso-crypto to `isoCrypto`
 */
const bundleForBrowser = async (): Promise<string> => {
    const output = (await build({
        configFile: false,
        logLevel: 'silent',
        plugins: [
            {
                name: 'no-node-modules',
                enforce: 'pre',
                resolveId(id, importer) {
                    if (nodeModules.has(id)) {
                        this.error(
                            `Browser build imports Node.js module ${id} from ${importer ?? 'the entry'}`
                        );
                    }
                },
            },
        ],
        build: {
            write: false,
            minify: false,
            lib: {
                entry: new URL('../data/entry.js', import.meta.url).pathname,
                formats: ['iife'],
                name: 'isoCrypto',
            },
        },
    })) as Rolldown.RolldownOutput[];

    return output[0]!.output[0].code;
};

/**
 * Runs in the page before any of its scripts. Records each Web Crypto method called.
 */
const trackWebCrypto = (): void => {
    globalThis.webCryptoCalls = new Set();

    const track = (proto: object, prefix: string): void => {
        for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(proto))) {
            // Read descriptors, as reading an accessor (e.g. `subtle`) on the prototype throws
            const value: unknown = descriptor.value;
            if (name !== 'constructor' && typeof value === 'function') {
                Reflect.set(proto, name, function (this: unknown, ...args: unknown[]): unknown {
                    globalThis.webCryptoCalls.add(`${prefix}.${name}`);
                    const result: unknown = Reflect.apply(value, this, args);
                    return result;
                });
            }
        }
    };
    track(Crypto.prototype, 'crypto');
    track(SubtleCrypto.prototype, 'crypto.subtle');
};

/**
 * Web Crypto is only available in a secure context, so the page is served from an `https` origin,
 * intercepted before it reaches the network.
 */
const origin = 'https://iso-crypto.test/';

/**
 * Opens a page with the bundle loaded.
 *
 * @param browser - browser to open the page in
 * @param code - bundled script
 * @returns page, with iso-crypto as `isoCrypto`
 */
const openPage = async (browser: Browser, code: string): Promise<Page> => {
    const page = await browser.newPage();
    await page.route(origin, async route =>
        route.fulfill({ contentType: 'text/html', body: '<!doctype html>' })
    );
    await page.addInitScript(trackWebCrypto);
    await page.goto(origin);
    await page.addScriptTag({ content: code });
    return page;
};

const webCryptoCalls = async (page: Page): Promise<string[]> =>
    page.evaluate(() => [...globalThis.webCryptoCalls]);

const hex = (bytes: Parameters<typeof NodeIsoCrypto.encode>[0]): string =>
    NodeIsoCrypto.encode(bytes, 'hex');
const fromHex = (text: string): { text: string; encoding: 'hex' } => ({ text, encoding: 'hex' });

/**
 * AES key sizes the browser supports. Chromium's Web Crypto has no 192-bit keys.
 *
 * @param browserType - browser to check
 * @returns key sizes in bits
 */
const aesSizes = (browserType: BrowserType): readonly (128 | 192 | 256)[] =>
    browserType === chromium ? [128, 256] : [128, 192, 256];
const curves = ['p256', 'p384', 'p521'] as const;

suite('iso-crypto in the browser', () => {
    const withBundle = before(async function (this: Context) {
        this.timeout(30_000);
        return { code: await bundleForBrowser() };
    });

    for (const browserType of [chromium, firefox, webkit] as BrowserType[]) {
        suite(browserType.name(), () => {
            const sizes = aesSizes(browserType);
            const encryptions: NodeIsoCrypto.Encryption[] = [
                ...(['CBC', 'CTR'] as const).flatMap(mode =>
                    sizes.map(size => ({ cipher: 'AES', size, mode }) as const)
                ),
                // GCM has no 192-bit keys
                ...([128, 256] as const).map(
                    size => ({ size, cipher: 'AES', mode: 'GCM' }) as const
                ),
            ];

            const withBrowser = withBundle.before(async function (this: Context) {
                this.timeout(30_000);
                return { browser: await browserType.launch() };
            });
            withBrowser.after(async ({ browser }) => browser.close());

            const withPage = withBrowser.beforeEach(async ({ browser, code }) => ({
                page: await openPage(browser, code),
            }));
            withPage.afterEach(async ({ page }) => page.close());

            withPage.test('Random bytes come from Web Crypto', async ({ page }) => {
                // Beyond the 65,536 byte limit of a single `getRandomValues` call
                const length = await page.evaluate(async () => {
                    const bytes = await globalThis.isoCrypto.randomBytes(100_000);
                    return bytes.length;
                });

                expect(length).to.equal(100_000);
                expect(await webCryptoCalls(page)).to.include('crypto.getRandomValues');
            });

            withPage.test('Encodes large input as base64', async ({ page }) => {
                const bytes = new Uint8Array(1_000_000).map((_, i) => i);
                const encoded = await page.evaluate(
                    input =>
                        globalThis.isoCrypto.encode({ text: input, encoding: 'hex' }, 'base64'),
                    hex(bytes)
                );

                expect(encoded).to.equal(NodeIsoCrypto.encode(bytes, 'base64'));
            });

            withPage.test('Hashes with Web Crypto, matching Node.js', async ({ page }) => {
                for (const algorithm of [
                    { algorithm: 'SHA1' },
                    { algorithm: 'SHA2', size: 256 },
                    { algorithm: 'SHA2', size: 384 },
                    { algorithm: 'SHA2', size: 512 },
                ] as const) {
                    const hashed = await page.evaluate(
                        async input =>
                            globalThis.isoCrypto.encode(
                                await globalThis.isoCrypto.hash('This is my text', input),
                                'hex'
                            ),
                        algorithm
                    );

                    expect(hashed).to.equal(
                        hex(await NodeIsoCrypto.hash('This is my text', algorithm))
                    );
                }
                expect(await webCryptoCalls(page)).to.include('crypto.subtle.digest');
            });

            withPage.test('Encrypts and decrypts with Node.js, both ways', async ({ page }) => {
                const data = 'This is my message';
                const secret = 'Super duper secret password';

                for (const encryption of encryptions) {
                    const fromBrowser = await page.evaluate(
                        async input => {
                            const { encrypted, iv } = await globalThis.isoCrypto.encrypt(
                                { data: input.data, secret: input.secret },
                                { encryption: input.encryption }
                            );
                            return globalThis.isoCrypto.encodeObject({ encrypted, iv }, 'hex');
                        },
                        { data, secret, encryption }
                    );
                    const decrypted = await NodeIsoCrypto.decrypt(
                        {
                            encrypted: fromHex(fromBrowser.encrypted),
                            iv: fromHex(fromBrowser.iv),
                            secret,
                        },
                        { encryption }
                    );
                    expect(NodeIsoCrypto.encode(decrypted)).to.equal(data);

                    const fromNode = await NodeIsoCrypto.encrypt({ data, secret }, { encryption });
                    const decryptedInBrowser = await page.evaluate(
                        async input =>
                            globalThis.isoCrypto.encode(
                                await globalThis.isoCrypto.decrypt(
                                    {
                                        encrypted: { text: input.encrypted, encoding: 'hex' },
                                        iv: { text: input.iv, encoding: 'hex' },
                                        secret: input.secret,
                                    },
                                    { encryption: input.encryption }
                                )
                            ),
                        {
                            encrypted: hex(fromNode.encrypted),
                            iv: hex(fromNode.iv),
                            secret,
                            encryption,
                        }
                    );
                    expect(decryptedInBrowser).to.equal(data);
                }
                expect(await webCryptoCalls(page)).to.include.members([
                    'crypto.subtle.encrypt',
                    'crypto.subtle.decrypt',
                ]);
            });

            withPage.test(
                'CTR counter carries across all 128 bits, as in Node.js',
                async ({ page }) => {
                    const data = 'The counter overflows into the high bits of the block';
                    for (const size of sizes) {
                        const secret = new Uint8Array(size / 8).fill(7);
                        // Low 64 bits of the counter block are all ones, so the second block carries into the high bits
                        const iv = new Uint8Array(16).fill(0xff, 8);
                        const cipher = createCipheriv(`aes-${size}-ctr`, secret, iv);
                        const encrypted = new Uint8Array([
                            ...cipher.update(data),
                            ...cipher.final(),
                        ]);

                        const decrypted = await page.evaluate(
                            async input =>
                                globalThis.isoCrypto.encode(
                                    await globalThis.isoCrypto.decrypt(
                                        {
                                            encrypted: { text: input.encrypted, encoding: 'hex' },
                                            iv: { text: input.iv, encoding: 'hex' },
                                            secret: { text: input.secret, encoding: 'hex' },
                                        },
                                        {
                                            encryption: {
                                                size: input.size,
                                                cipher: 'AES',
                                                mode: 'CTR',
                                            },
                                            hash: 'raw',
                                        }
                                    )
                                ),
                            { encrypted: hex(encrypted), iv: hex(iv), secret: hex(secret), size }
                        );
                        expect(decrypted).to.equal(data);
                    }
                }
            );

            if (browserType === chromium) {
                withPage.test(
                    'Rejects AES-192, which Chromium does not support',
                    async ({ page }) => {
                        await expect(
                            page.evaluate(async () =>
                                globalThis.isoCrypto.encrypt(
                                    {
                                        data: 'This is my message',
                                        secret: 'Super duper secret password',
                                    },
                                    { encryption: { cipher: 'AES', size: 192, mode: 'CBC' } }
                                )
                            )
                        ).to.be.rejectedWith(/192-bit AES keys are not supported/u);
                    }
                );
            }

            withPage.test('AES-GCM rejects tampering', async ({ page }) => {
                const rejected = await page.evaluate(async () => {
                    const encryption = { cipher: 'AES', size: 256, mode: 'GCM' } as const;
                    const secret = 'Holy Grail';
                    const { encrypted, iv } = await globalThis.isoCrypto.encrypt(
                        { data: 'Rosslyn Chapel', secret },
                        { encryption }
                    );
                    encrypted[0] = encrypted[0] === 0 ? 1 : 0;
                    try {
                        await globalThis.isoCrypto.decrypt(
                            { encrypted, iv, secret },
                            { encryption }
                        );
                        return false;
                    } catch {
                        return true;
                    }
                });

                expect(rejected).to.equal(true);
            });

            withPage.test('ECC keys match Node.js', async ({ page }) => {
                for (const curve of curves) {
                    const privateKey = await NodeIsoCrypto.generateEccPrivateKey(curve);
                    const publicKey = NodeIsoCrypto.generateEccPublicKey(privateKey, curve);

                    const inBrowser = await page.evaluate(
                        async input => {
                            const iso = globalThis.isoCrypto;
                            const generated = await iso.generateEccPrivateKey(input.curve);
                            const derived = iso.generateEccPublicKey(
                                { text: input.privateKey, encoding: 'hex' },
                                input.curve
                            );
                            const decompressed = iso.decompressEccPublicKey(derived, input.curve);
                            return iso.encodeObject(
                                {
                                    generated,
                                    decompressed,
                                    publicKey: derived,
                                    compressed: iso.compressEccPublicKey(decompressed, input.curve),
                                },
                                'hex'
                            );
                        },
                        { privateKey: hex(privateKey), curve }
                    );

                    expect(inBrowser.publicKey).to.equal(hex(publicKey));
                    expect(inBrowser.compressed).to.equal(hex(publicKey));
                    expect(inBrowser.decompressed).to.equal(
                        hex(NodeIsoCrypto.decompressEccPublicKey(publicKey, curve))
                    );
                    // Node.js validates the key it is given
                    expect(
                        hex(NodeIsoCrypto.generateEccPublicKey(fromHex(inBrowser.generated), curve))
                    ).to.have.length(hex(publicKey).length);
                }
            });

            withPage.test(
                'ECDH encrypts and decrypts with Node.js, both ways',
                async ({ page }) => {
                    const data = 'Hello, would you like a cup of tea?';
                    for (const curve of curves) {
                        const nodePrivateKey = await NodeIsoCrypto.generateEccPrivateKey(curve);
                        const nodePublicKey = NodeIsoCrypto.generateEccPublicKey(
                            nodePrivateKey,
                            curve
                        );

                        const fromBrowser = await page.evaluate(
                            async input => {
                                const iso = globalThis.isoCrypto;
                                const { encrypted, iv, publicKey } = await iso.eccEncrypt(
                                    {
                                        data: input.data,
                                        privateKey: await iso.generateEccPrivateKey(input.curve),
                                        publicKey: { text: input.publicKey, encoding: 'hex' },
                                    },
                                    { curve: input.curve }
                                );
                                return iso.encodeObject({ encrypted, iv, publicKey }, 'hex');
                            },
                            { data, curve, publicKey: hex(nodePublicKey) }
                        );
                        const decrypted = await NodeIsoCrypto.eccDecrypt(
                            {
                                encrypted: fromHex(fromBrowser.encrypted),
                                iv: fromHex(fromBrowser.iv),
                                publicKey: fromHex(fromBrowser.publicKey),
                                privateKey: nodePrivateKey,
                            },
                            { curve }
                        );
                        expect(NodeIsoCrypto.encode(decrypted)).to.equal(data);

                        const browserPrivateKey = await page.evaluate(
                            async input =>
                                globalThis.isoCrypto.encode(
                                    await globalThis.isoCrypto.generateEccPrivateKey(input),
                                    'hex'
                                ),
                            curve
                        );
                        const fromNode = await NodeIsoCrypto.eccEncrypt(
                            {
                                data,
                                privateKey: nodePrivateKey,
                                publicKey: NodeIsoCrypto.generateEccPublicKey(
                                    fromHex(browserPrivateKey),
                                    curve
                                ),
                            },
                            { curve }
                        );
                        const decryptedInBrowser = await page.evaluate(
                            async input =>
                                globalThis.isoCrypto.encode(
                                    await globalThis.isoCrypto.eccDecrypt(
                                        {
                                            encrypted: { text: input.encrypted, encoding: 'hex' },
                                            iv: { text: input.iv, encoding: 'hex' },
                                            publicKey: { text: input.publicKey, encoding: 'hex' },
                                            privateKey: { text: input.privateKey, encoding: 'hex' },
                                        },
                                        { curve: input.curve }
                                    )
                                ),
                            {
                                encrypted: hex(fromNode.encrypted),
                                iv: hex(fromNode.iv),
                                publicKey: hex(fromNode.publicKey),
                                privateKey: browserPrivateKey,
                                curve,
                            }
                        );
                        expect(decryptedInBrowser).to.equal(data);
                    }
                    expect(await webCryptoCalls(page)).to.include('crypto.subtle.deriveKey');
                }
            );

            withPage.test('Derives keys with Web Crypto, matching Node.js', async ({ page }) => {
                for (const options of [
                    { iterations: 1000 },
                    { algorithm: 'HKDF', info: 'context' },
                ] as const) {
                    const params = { secret: 'password', salt: 'salt' };
                    const derived = await page.evaluate(
                        async input =>
                            globalThis.isoCrypto.encode(
                                await globalThis.isoCrypto.deriveKey(input.params, input.options),
                                'hex'
                            ),
                        { params, options }
                    );

                    expect(derived).to.equal(hex(await NodeIsoCrypto.deriveKey(params, options)));
                }
                expect(await webCryptoCalls(page)).to.include('crypto.subtle.deriveBits');
            });
        });
    }
});
