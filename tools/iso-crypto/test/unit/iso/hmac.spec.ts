import type * as Hmac from '#hmac';
import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import * as IsoCrypto from 'iso-crypto';
import { suite, test } from 'mocha-chain';
import * as BrowserHmac from '#internal/iso/hmac/browser.js';
import * as NodeHmac from '#internal/iso/hmac/node.js';

const hex = (text: string) => ({ text, encoding: 'hex' }) as const;

const sha256 = { algorithm: 'SHA2', size: 256 } as const;
const sha384 = { algorithm: 'SHA2', size: 384 } as const;
const sha512 = { algorithm: 'SHA2', size: 512 } as const;

/**
 * Test cases of RFC 4231, except 5, whose output is truncated.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc4231#section-4}
 */
const rfc4231 = [
    {
        name: 'test case 1',
        secret: hex('0b'.repeat(20)),
        data: 'Hi There',
        sha256: 'b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7',
        sha384: 'afd03944d84895626b0825f4ab46907f15f9dadbe4101ec682aa034c7cebc59cfaea9ea9076ede7f4af152e8b2fa9cb6',
        sha512: '87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854',
    },
    {
        name: 'test case 2 (key shorter than the output)',
        secret: 'Jefe',
        data: 'what do ya want for nothing?',
        sha256: '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
        sha384: 'af45d2e376484031617f78d2b58a6b1b9c7ef464f5a01b47e42ec3736322445e8e2240ca5e69e2c78b3239ecfab21649',
        sha512: '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737',
    },
    {
        name: 'test case 3 (combined length of key and data larger than 64 bytes)',
        secret: hex('aa'.repeat(20)),
        data: hex('dd'.repeat(50)),
        sha256: '773ea91e36800e46854db8ebd09181a72959098b3ef8c122d9635514ced565fe',
        sha384: '88062608d3e6ad8a0aa2ace014c8a86f0aa635d947ac9febe83ef4e55966144b2a5ab39dc13814b94e3ab6e101a34f27',
        sha512: 'fa73b0089d56a284efb0f0756c890be9b1b5dbdd8ee81a3655f83e33b2279d39bf3e848279a722c806b485a47e67c807b946a337bee8942674278859e13292fb',
    },
    {
        name: 'test case 4 (combined length of key and data larger than 64 bytes)',
        secret: hex('0102030405060708090a0b0c0d0e0f10111213141516171819'),
        data: hex('cd'.repeat(50)),
        sha256: '82558a389a443c0ea4cc819899f2083a85f0faa3e578f8077a2e3ff46729665b',
        sha384: '3e8a69b7783c25851933ab6290af6ca77a9981480850009cc5577c6e1f573b4e6801dd23c4a7d679ccf8a386c674cffb',
        sha512: 'b0ba465637458c6990e5a8c5f61d4af7e576d97ff94b872de76f8050361ee3dba91ca5c11aa25eb4d679275cc5788063a5f19741120c4f2de2adebeb10a298dd',
    },
    {
        name: 'test case 6 (key larger than 128 bytes)',
        secret: hex('aa'.repeat(131)),
        data: 'Test Using Larger Than Block-Size Key - Hash Key First',
        sha256: '60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54',
        sha384: '4ece084485813e9088d2c63a041bc5b44f9ef1012a2b588f3cd11f05033ac4c60c2ef6ab4030fe8296248df163f44952',
        sha512: '80b24263c7c1a3ebb71493c1dd7be8b49b46d1f41b4aeec1121b013783f8f3526b56d037e05f2598bd0fd2215d6a1e5295e64f73f63f0aec8b915a985d786598',
    },
    {
        name: 'test case 7 (key and data larger than 128 bytes)',
        secret: hex('aa'.repeat(131)),
        data: 'This is a test using a larger than block-size key and a larger than block-size data. The key needs to be hashed before being used by the HMAC algorithm.',
        sha256: '9b09ffa71b942fcb27635fbcd5b0e944bfdc63644f0713938a7f51535c3a35e2',
        sha384: '6617178e941f020d351e2f254e8fd32c602420feb0b8fb9adccebb82461e99c5a678cc31e799176d3860e6110c46523e',
        sha512: 'e37b6a775dc87dbaa4dfa9f96e5e3ffddebd71f8867289865df5a32d20cdc944b6022cac3c4982b10d5eeb55c3e4de15134676fb6de0446065c97440fa8c6a58',
    },
] as const;

suite('Hmac', () => {
    test('coverage', async () => {
        await import('#internal/iso/hmac/types.js');
    });

    test('types', () => {
        expectTypeOf<typeof Hmac>().toEqualTypeOf(BrowserHmac);
        expectTypeOf<typeof Hmac>().toEqualTypeOf(NodeHmac);
        expectTypeOf(IsoCrypto).toExtend<typeof Hmac>();
    });

    for (const [name, source] of [
        ['Browser', BrowserHmac],
        ['Node', NodeHmac],
    ] as const) {
        suite(name, () => {
            suite('RFC 4231', () => {
                for (const vector of rfc4231) {
                    test(vector.name, async () => {
                        const { secret, data } = vector;
                        for (const [algorithm, expected] of [
                            [undefined, vector.sha256],
                            [sha256, vector.sha256],
                            [sha384, vector.sha384],
                            [sha512, vector.sha512],
                        ] as const) {
                            const options = algorithm && { hash: algorithm };
                            const signature = await source.hmac({ secret, data }, options);
                            expect(IsoCrypto.encode(signature, 'hex')).to.equal(expected);
                            expect(
                                await source.verifyHmac(
                                    { secret, data, signature: hex(expected) },
                                    options
                                )
                            ).to.equal(true);
                        }
                    });
                }
            });

            test('SHA1 (RFC 2202)', async () => {
                const params = { secret: hex('0b'.repeat(20)), data: 'Hi There' };
                const options = { hash: { algorithm: 'SHA1' } } as const;
                const signature = await source.hmac(params, options);
                expect(IsoCrypto.encode(signature, 'hex')).to.equal(
                    'b617318655057264e28bc0b6fb378c8ef146be00'
                );
                expect(await source.verifyHmac({ ...params, signature }, options)).to.equal(true);
            });

            suite('verifyHmac rejects', () => {
                const secret = 'whsec_secret';
                const data = 'msg_1.1700000000.{"type":"ping"}';

                test('wrong signature', async () => {
                    const signature = await source.hmac({ secret, data });
                    signature[0]! ^= 1;
                    expect(await source.verifyHmac({ secret, data, signature })).to.equal(false);
                });

                test('wrong secret', async () => {
                    const signature = await source.hmac({ secret, data });
                    expect(
                        await source.verifyHmac({ secret: `${secret}!`, data, signature })
                    ).to.equal(false);
                });

                test('tampered data', async () => {
                    const signature = await source.hmac({ secret, data });
                    expect(
                        await source.verifyHmac({ data: `${data} `, secret, signature })
                    ).to.equal(false);
                });

                test('wrong algorithm', async () => {
                    const signature = await source.hmac({ secret, data }, { hash: sha512 });
                    expect(await source.verifyHmac({ secret, data, signature })).to.equal(false);
                });

                test('wrong length', async () => {
                    const signature = await source.hmac({ secret, data });
                    for (const wrongLength of [
                        signature.slice(0, -1),
                        signature.slice(0, 16),
                        new Uint8Array(0),
                        IsoCrypto.decode({
                            text: `${IsoCrypto.encode(signature, 'hex')}00`,
                            encoding: 'hex',
                        }),
                    ]) {
                        expect(
                            await source.verifyHmac({ secret, data, signature: wrongLength })
                        ).to.equal(false);
                    }
                });
            });

            test('Webhook signature', async () => {
                // Standard Webhooks signs `${id}.${timestamp}.${body}`, sending the base64 signature as `v1,<signature>`
                const secret = IsoCrypto.decode({
                    text: 'MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
                    encoding: 'base64',
                });
                const data = 'msg_p5jXN8AQM9LWM0D4loKWxJek.1614265330.{"test": 2432232314}';
                const signature = 'g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=';

                expect(IsoCrypto.encode(await source.hmac({ secret, data }), 'base64')).to.equal(
                    signature
                );
                expect(
                    await source.verifyHmac({
                        secret,
                        data,
                        signature: { text: signature, encoding: 'base64' },
                    })
                ).to.equal(true);
            });

            test('Empty secret', async () => {
                await expect(source.hmac({ secret: '', data: 'data' })).to.be.rejectedWith(
                    RangeError,
                    'HMAC secret must not be empty'
                );
                await expect(
                    source.verifyHmac({ secret: new Uint8Array(0), data: 'data', signature: '' })
                ).to.be.rejectedWith(RangeError, 'HMAC secret must not be empty');
            });

            test('Empty data', async () => {
                const signature = await source.hmac({ secret: 'key', data: '' });
                expect(IsoCrypto.encode(signature, 'hex')).to.equal(
                    '5d5d139563c95b5967b9bd9a8c9b233a9dedb45072794cd232dc1b74832607d0'
                );
            });
        });
    }
});
