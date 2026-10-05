import type { Context } from 'mocha';
import type { Rolldown } from 'vite';
import { builtinModules } from 'node:module';
import vm from 'node:vm';
import { build } from 'vite';
import { expect } from '@leyman/expect';
import * as NodeIsoCrypto from 'iso-crypto';
import { before, suite } from 'mocha-chain';

type IsoCrypto = typeof NodeIsoCrypto;

const nodeModules = new Set([...builtinModules, ...builtinModules.map(name => `node:${name}`)]);

/**
 * Bundles iso-crypto as a browser app would, failing on any import of a Node.js module.
 *
 * @returns bundled script, which assigns iso-crypto to `IsoCrypto`
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
                name: 'IsoCrypto',
            },
        },
    })) as Rolldown.RolldownOutput[];

    return output[0]!.output[0].code;
};

/**
 * Runs the bundle with only web APIs as globals: no `process`, `Buffer`, `require`, etc.
 * Records which Web Crypto methods are called.
 *
 * @param code - bundled script
 * @returns browser iso-crypto, and the Web Crypto methods it called
 */
const runInBrowser = (code: string): { isoCrypto: IsoCrypto; webCryptoCalls: Set<string> } => {
    const webCryptoCalls = new Set<string>();
    const subtle = new Proxy(globalThis.crypto.subtle, {
        get: (obj, prop) => {
            const value: unknown = Reflect.get(obj, prop, obj);
            if (typeof value !== 'function') {
                return value;
            }
            return (...args: unknown[]): unknown => {
                webCryptoCalls.add(`crypto.subtle.${String(prop)}`);
                return Reflect.apply(value, obj, args);
            };
        },
    });

    const context = vm.createContext({
        crypto: {
            getRandomValues: <T extends ArrayBufferView<ArrayBuffer>>(array: T): T => {
                webCryptoCalls.add('crypto.getRandomValues');
                return globalThis.crypto.getRandomValues(array);
            },
            subtle,
        },
        atob: globalThis.atob,
        btoa: globalThis.btoa,
        TextEncoder,
        TextDecoder,
    });
    // eslint-disable-next-line sonarjs/code-eval -- runs the bundle built above, in an isolated context
    vm.runInContext(code, context);

    return { isoCrypto: context.IsoCrypto as IsoCrypto, webCryptoCalls };
};

suite('iso-crypto in the browser', () => {
    const withBundle = before(async function (this: Context) {
        this.timeout(30_000);
        return { code: await bundleForBrowser() };
    });

    const withBrowser = withBundle.beforeEach(({ code }) => runInBrowser(code));

    withBrowser.test('Random bytes come from Web Crypto', async ({ isoCrypto, webCryptoCalls }) => {
        expect(await isoCrypto.randomBytes(16)).to.have.length(16);
        expect(webCryptoCalls).to.include('crypto.getRandomValues');
    });

    withBrowser.test('Hashes with Web Crypto', async ({ isoCrypto, webCryptoCalls }) => {
        const hashed = isoCrypto.encode(await isoCrypto.hash('This is my text'), 'hex');

        expect(hashed).to.equal(
            NodeIsoCrypto.encode(await NodeIsoCrypto.hash('This is my text'), 'hex')
        );
        expect(webCryptoCalls).to.include('crypto.subtle.digest');
    });

    withBrowser.test(
        'Encrypts with Web Crypto, readable by Node.js',
        async ({ isoCrypto, webCryptoCalls }) => {
            const secret = 'Super duper secret password';
            const { encrypted, iv } = await isoCrypto.encrypt({
                data: 'This is my message',
                secret,
            });

            const decrypted = await NodeIsoCrypto.decrypt({
                encrypted: { text: isoCrypto.encode(encrypted, 'hex'), encoding: 'hex' },
                iv: { text: isoCrypto.encode(iv, 'hex'), encoding: 'hex' },
                secret,
            });

            expect(NodeIsoCrypto.encode(decrypted)).to.equal('This is my message');
            expect(webCryptoCalls).to.include('crypto.subtle.encrypt');
        }
    );

    withBrowser.test(
        'Derives ECC secrets with Web Crypto, readable by Node.js',
        async ({ isoCrypto, webCryptoCalls }) => {
            const receiverPrivateKey = await NodeIsoCrypto.generateEccPrivateKey();
            const receiverPublicKey = NodeIsoCrypto.encode(
                NodeIsoCrypto.generateEccPublicKey(receiverPrivateKey),
                'hex'
            );

            const { encrypted, iv, publicKey } = await isoCrypto.eccEncrypt({
                data: 'Hello, would you like a cup of tea?',
                privateKey: await isoCrypto.generateEccPrivateKey(),
                publicKey: { text: receiverPublicKey, encoding: 'hex' },
            });

            const decrypted = await NodeIsoCrypto.eccDecrypt({
                encrypted: { text: isoCrypto.encode(encrypted, 'hex'), encoding: 'hex' },
                iv: { text: isoCrypto.encode(iv, 'hex'), encoding: 'hex' },
                publicKey: { text: isoCrypto.encode(publicKey, 'hex'), encoding: 'hex' },
                privateKey: receiverPrivateKey,
            });

            expect(NodeIsoCrypto.encode(decrypted)).to.equal('Hello, would you like a cup of tea?');
            expect(webCryptoCalls).to.include('crypto.subtle.deriveKey');
        }
    );

    withBrowser.test(
        'Encrypts with AES-GCM in Web Crypto, readable by Node.js',
        async ({ isoCrypto, webCryptoCalls }) => {
            const secret = 'Super duper secret password';
            const encryption = { cipher: 'AES', size: 256, mode: 'GCM' } as const;
            const { encrypted, iv } = await isoCrypto.encrypt(
                { data: 'This is my message', secret },
                { encryption }
            );

            const decrypted = await NodeIsoCrypto.decrypt(
                {
                    encrypted: { text: isoCrypto.encode(encrypted, 'hex'), encoding: 'hex' },
                    iv: { text: isoCrypto.encode(iv, 'hex'), encoding: 'hex' },
                    secret,
                },
                { encryption }
            );

            expect(NodeIsoCrypto.encode(decrypted)).to.equal('This is my message');
            expect(webCryptoCalls).to.include('crypto.subtle.encrypt');
        }
    );

    withBrowser.test(
        'Derives keys with Web Crypto, matching Node.js',
        async ({ isoCrypto, webCryptoCalls }) => {
            for (const options of [
                { iterations: 1000 },
                { algorithm: 'HKDF', info: 'context' },
            ] as const) {
                const params = { secret: 'password', salt: 'salt' };
                expect(
                    isoCrypto.encode(await isoCrypto.deriveKey(params, options), 'hex')
                ).to.equal(
                    NodeIsoCrypto.encode(await NodeIsoCrypto.deriveKey(params, options), 'hex')
                );
            }
            expect(webCryptoCalls).to.include('crypto.subtle.deriveBits');
        }
    );
});
