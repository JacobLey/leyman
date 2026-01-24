import type { Context } from 'mocha';
import type * as Ecc from '#ecc';
import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import * as IsoCrypto from 'iso-crypto';
import { before, suite, test } from 'mocha-chain';
import * as BrowserEcc from '../../../iso/ecc/browser.js';
import * as NodeEcc from '../../../iso/ecc/node.js';
import { Ciphers, Curves, Encodings, Modes } from '../../../types.js';

interface EccSourceContext {
    source: typeof Ecc;
}

interface EccContext extends EccSourceContext {
    target: typeof Ecc;
}

suite('Ecc', () => {
    test('coverage', async () => {
        await import('../../../iso/ecc/types.js');
    });

    test('types', () => {
        expectTypeOf<typeof Ecc>().toEqualTypeOf(BrowserEcc);
        expectTypeOf<typeof Ecc>().toEqualTypeOf(NodeEcc);
        expectTypeOf(IsoCrypto).toExtend<typeof Ecc>();
    });

    const successTest = async function (this: Context, { source, target }: EccContext) {
        this.timeout(30_000);

        for (const encryption of [
            null,
            undefined,
            {
                cipher: Ciphers.AES,
                size: 128,
                mode: Modes.CBC,
            },
            {
                cipher: Ciphers.AES,
                size: 256,
                mode: Modes.CBC,
            },
            {
                cipher: Ciphers.AES,
                size: 192,
                mode: Modes.CTR,
            },
        ] as const) {
            for (const curve of [null, undefined, Curves.P256, Curves.P384, Curves.P521] as const) {
                let options: Parameters<(typeof Ecc)['eccEncrypt']>[1];
                const curveOptions = curve === null ? [] : [curve];
                if (curve !== null) {
                    options = { curve };
                }
                if (encryption !== null) {
                    options ??= {};
                    options.encryption = encryption;
                }

                const [sourcePrivateKey, targetPrivateKey] = await Promise.all([
                    source.generateEccPrivateKey(...curveOptions),
                    target.generateEccPrivateKey(...curveOptions),
                ]);

                const data =
                    'This is my super secret message I am sending to my friend. No peeking!';

                const encrypted = await source.eccEncrypt(
                    {
                        data,
                        privateKey: sourcePrivateKey,
                        publicKey: target.generateEccPublicKey(targetPrivateKey, ...curveOptions),
                    },
                    options
                );

                const decrypted = await target.eccDecrypt(
                    {
                        ...encrypted,
                        privateKey: targetPrivateKey,
                    },
                    options
                );

                expect(IsoCrypto.encode(decrypted)).to.equal(data);
            }
        }
    };

    const eccDecryptTest = async function (this: Context, { source }: EccSourceContext) {
        this.timeout(8000);

        for (const { output, curve, encrypted, iv, privateKey, publicKey, encryption } of [
            {
                output: "Hello I have been trying to reach you about your car's extended warranty",
                encrypted:
                    '2997df9daa3345056517eaa24b635c58caf7317f4ba1517ed50043477cd28def2b2de1f006c392c1fda' +
                    '98f177c95d0cebed5c1e8bd56a57510e4782e6711f1762f5f3feda15080a1',
                iv: '128e4cea8d498b5651323ff5f3e8d2d8',
                publicKey: '02575ccf97b1c75a042b727c943bb06656267fbd3ab802cae990693d69df9f31fd',
                privateKey: '77fbbd22556c898c57784f33d50f41e741c2dbc696694f35f891d9a6465cb923',
            },
            {
                output: 'Erised stra ehru oyt ube cafru oyt on wohsi',
                encryption: {
                    cipher: 'AES',
                    size: 128,
                    mode: 'CBC',
                },
                encrypted:
                    '3f84fdf2775293ccbc3b280430ea05fb1a9bf53841b34f111' +
                    '28c9f75c9d9a202409e353742a0849d3c551f23caf0b997',
                iv: '8f070f27ff06c8536b3253ad9fe8776f',
                publicKey: '02f5cb1d664694b4f78c0ca1b6a2709e1a26633ba329ca22f89a125eb4c2a5cc90',
                privateKey: '1c3b0a30fdf86f95e3017f31678833a8ca78dae76a5ce26b21fb4a7803e42747',
            },
            {
                output: 'I open at the close',
                curve: 'p384',
                encryption: {
                    cipher: 'AES',
                    size: 192,
                    mode: 'CTR',
                },
                encrypted: '5778b03cdb9a46276aa6086e880950e56c9968',
                iv: '45e9417f93e329884fd0273f81f71ccc',
                publicKey:
                    '02e67701fa0cb82129d51a68758f617514c87f96a2543a6f114' +
                    '803175dc103fd68c316a405dca3f5af8444c556a216563f',
                privateKey:
                    '1a605608450aed894cb8552a4720d661c97926c9b9b166eda1' +
                    '071a4ac1136de000a432d627a2f01ab9d0307f4dd94be6',
            },
            {
                output: 'What does Bilbo have in his pocket?',
                curve: 'p521',
                encrypted: 'da131ad629eaba7ccba366ce1c95fc564a9b4e2e44faa6c240ab2e4e9ce197312b765e',
                iv: '61fa349704fa9e6b9036fb5e3c3da8ca',
                publicKey:
                    '02006f4f5a519471e0ecd7d036ef7090116cd10650fa49acd12005e930c9efbe' +
                    '2f10e005e8547bc70646519a9ebfa4f77435f1f1ba7e8f0166855d5d0624aec95c3fc2',
                privateKey:
                    '00430374771829e9f1634d2cf13cf2e6764654e1312762e9b57219e3b50867b' +
                    '9ae6b64459a0f96757e49b224a425cb5a615bb7bbd8c61304eaa191c7b1c3c2fd242a',
            },
        ] as const) {
            for (const compressed of [true, false]) {
                const decrypted = await source.eccDecrypt(
                    {
                        ...IsoCrypto.decodeObject(
                            {
                                encrypted,
                                iv,
                                privateKey,
                            },
                            Encodings.HEX
                        ),
                        publicKey: compressed
                            ? { text: publicKey, encoding: Encodings.HEX }
                            : IsoCrypto.decompressEccPublicKey({
                                  text: publicKey,
                                  encoding: Encodings.HEX,
                              }),
                    },
                    { curve, encryption }
                );
                expect(IsoCrypto.encode(decrypted)).to.equal(output);
            }
        }
    };

    const compressionTest = function (this: Context, { source }: EccSourceContext) {
        for (const { curve, privateKey, compressedPublicKey, decompressedPublicKey } of [
            {
                privateKey: '6b86a3d180945159e8411b6ccd36050deda274452fa6349b3447df91a867d954',
                compressedPublicKey:
                    '02b23df7dcbfb6e250065a44a721aa273c49d006121a351bedbf3bdcb02c4e2995',
                decompressedPublicKey:
                    '04b23df7dcbfb6e250065a44a721aa273c49d006121a351bedbf3bdcb02c4e2995' +
                    'a32a6539d683575ed084be3251eca7bfc6e97b640a5de3ddab36536ae2d34868',
            },
            {
                curve: 'p256',
                privateKey: 'b2ddf1f3b903800c757afff4e32c0d760437732a509fbc9d280d5bc8b09f98a2',
                compressedPublicKey:
                    '02bb83fa7e732c35e90a495f54168b2aada58355d294367e0e2c254595eb67a394',
                decompressedPublicKey:
                    '04bb83fa7e732c35e90a495f54168b2aada58355d294367e0e2c254595eb67a394' +
                    '739670b47dd2f4a6ee14820ef3e6972a7c1af5a1facda1c1882e5f1b9e96e74a',
            },
            {
                curve: 'p384',
                privateKey:
                    '26039553d10468fcb44bb84b81ac8b6c45bc193fa330b' +
                    '041e436f9df133f6db8de5756f42a1dd478e14af39faa20840e',
                compressedPublicKey:
                    '03b8bbe4fc6b408bafa5b5a0d929cd23dc66' +
                    'a1828930c01a6bade6aa483236ea91c6b3e581beaf5b60f8fa90cd4075beb2',
                decompressedPublicKey:
                    '04b8bbe4fc6b408bafa5b5a0d929cd23dc66a1828930c01a6bad' +
                    'e6aa483236ea91c6b3e581beaf5b60f8fa90cd4075beb27b5b5cb00ea651d2d16c78994' +
                    'ed9bc0e798f9a597b3cb07c9181c9c81d9feeef17c036b5a2c467c89a5964cc4f2bf689',
            },
            {
                curve: 'p521',
                privateKey:
                    '01e0a20152f536898a29398625345017206deb41619905e81fd37f89ae36c857be' +
                    '8521490cde26a941e17bbaaca5601f57f8cd5ed5bdff7f88509a4aaee4f80292c3',
                compressedPublicKey:
                    '0301623ddc9f57468de64b545650d4d3532549129933a464d75d674cb' +
                    'e94c0af77be41be291129eb7b8b1eaef4b15a6853344071af18e4216058f43d78da536114debb',
                decompressedPublicKey:
                    '0401623ddc9f57468de64b545650d4d3532549129933a464d75d674' +
                    'cbe94c0af77be41be291129eb7b8b1eaef4b15a6853344071af18e4216058f43d78da53611' +
                    '4debb01579e5240e7d38c271ecfd37e987e92a6a54373623272c144cae99290c443b2e2f6c' +
                    '1db76fbc25320ae509c4fa93d89ab96b9f4542f40e72c0086b7bec50b1ac889',
            },
        ] as const) {
            const publicKey = source.generateEccPublicKey(
                {
                    text: privateKey,
                    encoding: 'hex',
                },
                curve
            );

            expect(IsoCrypto.encode(publicKey, 'hex')).to.equal(compressedPublicKey);
            expect(IsoCrypto.compressEccPublicKey(publicKey, curve)).to.deep.equal(publicKey);

            const decompressed = IsoCrypto.decompressEccPublicKey(publicKey, curve);
            expect(IsoCrypto.encode(decompressed, 'hex')).to.equal(decompressedPublicKey);
            expect(IsoCrypto.decompressEccPublicKey(decompressed, curve)).to.deep.equal(
                decompressed
            );

            expect(IsoCrypto.compressEccPublicKey(decompressed, curve)).to.deep.equal(publicKey);
        }
    };

    suite('From Browser', () => {
        const browserSource = before(() => ({
            source: BrowserEcc,
        }));

        suite('To Browser', () => {
            browserSource
                .before(() => ({
                    target: BrowserEcc,
                }))
                .test('success', successTest);
        });

        suite('To Node', () => {
            browserSource
                .before(() => ({
                    target: NodeEcc,
                }))
                .test('success', successTest);
        });

        browserSource.test('eccDecrypt', eccDecryptTest);
        browserSource.test('compression', compressionTest);
    });

    suite('From Node', () => {
        const nodeSource = before(() => ({
            source: NodeEcc,
        }));

        suite('To Browser', () => {
            nodeSource
                .before(() => ({
                    target: BrowserEcc,
                }))
                .test('success', successTest);
        });

        suite('To Node', () => {
            nodeSource
                .before(() => ({
                    target: NodeEcc,
                }))
                .test('success', successTest);
        });

        nodeSource.test('eccDecrypt', eccDecryptTest);
        nodeSource.test('compression', compressionTest);
    });
});
