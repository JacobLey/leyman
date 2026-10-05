import type * as Derive from '#derive';
import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import * as IsoCrypto from 'iso-crypto';
import { suite, test } from 'mocha-chain';
import * as BrowserDerive from '#internal/iso/derive/browser.js';
import * as NodeDerive from '#internal/iso/derive/node.js';

const hex = (text: string) => ({ text, encoding: 'hex' }) as const;

suite('Derive', () => {
    test('coverage', async () => {
        await import('#internal/iso/derive/types.js');
    });

    test('types', () => {
        expectTypeOf<typeof Derive>().toEqualTypeOf(BrowserDerive);
        expectTypeOf<typeof Derive>().toEqualTypeOf(NodeDerive);
        expectTypeOf(IsoCrypto).toExtend<typeof Derive>();
    });

    for (const [name, source] of [
        ['Browser', BrowserDerive],
        ['Node', NodeDerive],
    ] as const) {
        suite(name, () => {
            test('PBKDF2 (RFC 7914)', async () => {
                const key = await source.deriveKey(
                    { secret: 'password', salt: 'salt' },
                    { iterations: 1 }
                );
                expect(IsoCrypto.encode(key, 'hex')).to.equal(
                    '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b'
                );
            });

            test('HKDF (RFC 5869)', async () => {
                const key = await source.deriveKey(
                    {
                        secret: hex('0b'.repeat(22)),
                        salt: hex('000102030405060708090a0b0c'),
                    },
                    { algorithm: 'HKDF', info: hex('f0f1f2f3f4f5f6f7f8f9'), size: 336 }
                );
                expect(IsoCrypto.encode(key, 'hex')).to.equal(
                    '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865'
                );
            });

            test('HKDF without info', async () => {
                const key = await source.deriveKey(
                    { secret: hex('0b'.repeat(22)), salt: '' },
                    { algorithm: 'HKDF', hash: { algorithm: 'SHA1' }, size: 128 }
                );
                expect(key).to.have.length(16);
            });

            test('Defaults to 256 bit PBKDF2 with 600,000 iterations', async () => {
                const [defaults, explicit] = await Promise.all([
                    source.deriveKey({ secret: 'password', salt: 'salt' }),
                    NodeDerive.deriveKey(
                        { secret: 'password', salt: 'salt' },
                        {
                            algorithm: 'PBKDF2',
                            hash: { algorithm: 'SHA2', size: 256 },
                            iterations: 600_000,
                            size: 256,
                        }
                    ),
                ]);
                expect(defaults).to.deep.equal(explicit);
                expect(defaults).to.have.length(32);
            });
        });
    }

    test('Derived keys encrypt with a raw hash', async () => {
        const secret = await IsoCrypto.deriveKey(
            { secret: 'correct horse battery staple', salt: 'salt' },
            { iterations: 1000, hash: { algorithm: 'SHA2', size: 512 } }
        );
        const encryption = { cipher: 'AES', size: 256, mode: 'GCM' } as const;
        const encrypted = await IsoCrypto.encrypt(
            { data: 'data', secret },
            { encryption, hash: 'raw' }
        );
        const decrypted = await IsoCrypto.decrypt(
            { ...encrypted, secret },
            { encryption, hash: 'raw' }
        );
        expect(IsoCrypto.encode(decrypted)).to.equal('data');
    });
});
