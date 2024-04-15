import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import * as IsoCrypto from 'iso-crypto';
import { before, suite, test } from 'mocha-hookup';
import type * as Hash from '#hash';
import * as BrowserHash from '../../../iso/hash/browser.js';
import * as NodeHash from '../../../iso/hash/node.js';

suite('Hash', () => {
    test('coverage', async () => {
        await import('../../../iso/hash/types.js');
    });

    test('types', () => {
        expectTypeOf<typeof Hash>().toEqualTypeOf(BrowserHash);
        expectTypeOf<typeof Hash>().toEqualTypeOf(NodeHash);
        expectTypeOf(IsoCrypto).toMatchTypeOf<typeof Hash>();
    });

    suite('hash', () => {
        interface HashContext {
            hash: typeof Hash;
        }

        const successTest = async ({ hash }: HashContext) => {
            for (const { algorithm, output } of [
                {
                    algorithm: {
                        algorithm: 'SHA1',
                    },
                    output: '01e38a965a1019b1003ffa23146a15f4dbb6afb5',
                },
                {
                    algorithm: {
                        algorithm: 'SHA2',
                        size: 256,
                    },
                    output: '59621e86e94afa1811ef2f787211bf82af15f669ed3b0658461b0f9e94534ec4',
                },
                {
                    algorithm: {
                        algorithm: 'SHA2',
                        size: 384,
                    },
                    output: '0f28e081173c74f6ee91e9f6c435483e4e229689e053b7f90fce1afb0295b8f633d37c2fcc21858f72eedcd0b7e7be56',
                },
                {
                    algorithm: {
                        algorithm: 'SHA2',
                        size: 512,
                    },
                    output: '0f9c020a7b773cb718e211c28d6b7a0b8825fc928d885b8d3f08e82ed644882728a21d8a55ca24205d51b5862212ae71f3e8cb3ef33f39946c240641e5a6444c',
                },
            ] as const) {
                const hashed = await hash.hash('This is some text to hash!', algorithm);
                expect(IsoCrypto.encode(hashed, 'hex')).to.equal(output);
            }
        };

        const emptyTest = async ({ hash }: HashContext) => {
            for (const { algorithm, output } of [
                {
                    algorithm: {
                        algorithm: 'SHA1',
                    },
                    output: 'da39a3ee5e6b4b0d3255bfef95601890afd80709',
                },
                {
                    algorithm: undefined,
                    output: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                },
                {
                    algorithm: {
                        algorithm: 'SHA2',
                        size: 384,
                    },
                    output: '38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b',
                },
                {
                    algorithm: {
                        algorithm: 'SHA2',
                        size: 512,
                    },
                    output: 'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e',
                },
            ] as const) {
                const hashed = await hash.hash('', algorithm);
                expect(IsoCrypto.encode(hashed, 'hex')).to.equal(output);
            }
        };

        const rawTest = async ({ hash }: HashContext) => {
            const buf = IsoCrypto.decode({ text: 'abcd', encoding: 'hex' });
            expect(await hash.hash(buf, 'raw')).to.eq(buf);
        };

        suite('browser', () => {
            const withBrowserHash = before(() => ({
                hash: BrowserHash,
            }));

            withBrowserHash.test('success', successTest);
            withBrowserHash.test('empty', emptyTest);
            withBrowserHash.test('raw', rawTest);
        });

        suite('node', () => {
            const withNodeHash = before(() => ({
                hash: NodeHash,
            }));

            withNodeHash.test('success', successTest);
            withNodeHash.test('empty', emptyTest);
            withNodeHash.test('raw', rawTest);
        });
    });
});
