import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import { before, suite, test } from 'mocha-hookup';
import * as IsoCrypto from 'iso-crypto';
import type * as Encode from '#encode';
import * as BrowserEncode from '../../../iso/encode/browser.js';
import * as NodeEncode from '../../../iso/encode/node.js';

// coverage
import '../../../iso/encode/types.js';

interface EncodeContext {
    encode: typeof Encode;
}

suite('Encode', () => {
    test('types', () => {
        expectTypeOf<typeof Encode>().toEqualTypeOf(BrowserEncode);
        expectTypeOf<typeof Encode>().toMatchTypeOf(NodeEncode);
        expectTypeOf(IsoCrypto).toMatchTypeOf<typeof Encode>();
    });

    suite('decode', () => {
        const base64Test = ({ encode }: EncodeContext) => {
            for (const encoding of ['base64', 'base64url'] as const) {
                for (const { input, output } of [
                    {
                        input: 'q8Ej',
                        output: [171, 193, 35],
                    },
                    {
                        input: 'q8E=',
                        output: [171, 193],
                    },
                    {
                        input: 'q8E',
                        output: [171, 193],
                    },
                    {
                        input: 'AAASAAA=',
                        output: [0, 0, 18, 0, 0],
                    },
                    {
                        input: 'AAASAAA',
                        output: [0, 0, 18, 0, 0],
                    },
                    {
                        input: '_-Q',
                        output: [255, 228],
                    },
                    {
                        input: '/+Q=',
                        output: [255, 228],
                    },
                    {
                        input: '-_-_--__',
                        output: [251, 255, 191, 251, 239, 255],
                    },
                    {
                        input: '+/+/++//',
                        output: [251, 255, 191, 251, 239, 255],
                    },
                    {
                        input: '-_-_-_Q=======',
                        output: [251, 255, 191, 251, 244],
                    },
                    {
                        input: '+/+/+/Q=======',
                        output: [251, 255, 191, 251, 244],
                    },
                    {
                        input: '',
                        output: [],
                    },
                ]) {
                    const buf = encode.decode({
                        text: input,
                        encoding,
                    });
                    expect(buf).to.be.an.instanceOf(Uint8Array);
                    expect([...buf]).to.deep.equal(output);
                }
            }
        };

        const hexTest = ({ encode }: EncodeContext) => {
            for (const { input, output } of [
                {
                    input: 'abc123',
                    output: [171, 193, 35],
                },
                {
                    input: '123',
                    output: [1, 35],
                },
                {
                    input: '0123',
                    output: [1, 35],
                },
                {
                    input: '0000120000',
                    output: [0, 0, 18, 0, 0],
                },
                {
                    input: '',
                    output: [],
                },
            ]) {
                expect([
                    ...encode.decode({
                        text: input,
                        encoding: 'hex',
                    }),
                ]).to.deep.equal(output);
            }
        };

        const utf8Test = ({ encode }: EncodeContext) => {
            for (const { input, output } of [
                {
                    input: 'abc123',
                    output: [97, 98, 99, 49, 50, 51],
                },
                {
                    input: '',
                    output: [],
                },
                {
                    input: '\u0000\u00012\u3456',
                    output: [0, 1, 50, 227, 145, 150],
                },
            ]) {
                const withDefault = encode.decode(input);
                expect([...withDefault]).to.deep.equal(output);
                expect(withDefault).to.deep.equal(
                    encode.decode({
                        text: input,
                        encoding: 'utf8',
                    })
                );
            }
        };

        const rawTest = ({ encode }: EncodeContext) => {
            for (const arr of [
                [1, 2, 3, 4],
                [97, 98, 99, 49, 50, 51],
                [0, 0, 0],
                [],
            ]) {
                const buf = Buffer.from(arr);
                expect(encode.decode(buf)).to.eq(buf);
                expect(encode.decode({ text: buf, encoding: 'raw' })).to.eq(
                    buf
                );
            }
        };

        suite('browser', () => {
            const withBrowserEncode = before(() => ({
                encode: BrowserEncode,
            }));

            withBrowserEncode.test('base64', base64Test);
            withBrowserEncode.test('hex', hexTest);
            withBrowserEncode.test('utf8', utf8Test);
            withBrowserEncode.test('raw', rawTest);
        });

        suite('node', () => {
            const withNodeEncode = before(() => ({
                encode: NodeEncode,
            }));

            withNodeEncode.test('base64', base64Test);
            withNodeEncode.test('hex', hexTest);
            withNodeEncode.test('utf8', utf8Test);
            withNodeEncode.test('raw', rawTest);
        });
    });

    suite('encode', () => {
        const base64Test = ({ encode }: EncodeContext) => {
            for (const { input, output } of [
                {
                    input: [171, 193, 35],
                    output: 'q8Ej',
                },
                {
                    input: [171, 193],
                    output: 'q8E=',
                },
                {
                    input: [0, 0, 18, 0, 0],
                    output: 'AAASAAA=',
                },
                {
                    input: [251, 244],
                    output: '+/Q=',
                },
                {
                    input: [255, 228],
                    output: '/+Q=',
                },
                {
                    input: [251, 255, 191, 251, 239, 255],
                    output: '+/+/++//',
                },
                {
                    input: [251, 255, 191, 251, 244],
                    output: '+/+/+/Q=',
                },
                {
                    input: [],
                    output: '',
                },
            ]) {
                expect(encode.encode(Buffer.from(input), 'base64')).to.equal(
                    output
                );
            }
        };

        const base64urlTest = ({ encode }: EncodeContext) => {
            for (const { input, output } of [
                {
                    input: [171, 193, 35],
                    output: 'q8Ej',
                },
                {
                    input: [171, 193],
                    output: 'q8E',
                },
                {
                    input: [0, 0, 18, 0, 0],
                    output: 'AAASAAA',
                },
                {
                    input: [251, 244],
                    output: '-_Q',
                },
                {
                    input: [255, 228],
                    output: '_-Q',
                },
                {
                    input: [251, 255, 191, 251, 239, 255],
                    output: '-_-_--__',
                },
                {
                    input: [251, 255, 191, 251, 244],
                    output: '-_-_-_Q',
                },
                {
                    input: [],
                    output: '',
                },
            ]) {
                expect(encode.encode(Buffer.from(input), 'base64url')).to.equal(
                    output
                );
            }
        };

        const hexTest = ({ encode }: EncodeContext) => {
            for (const { input, output } of [
                {
                    input: [171, 193, 35],
                    output: 'abc123',
                },
                {
                    input: [1, 35],
                    output: '0123',
                },
                {
                    input: [0, 0, 18, 0, 0],
                    output: '0000120000',
                },
                {
                    input: [],
                    output: '',
                },
            ]) {
                expect(encode.encode(Buffer.from(input), 'hex')).to.equal(
                    output
                );
            }
        };

        const utf8Test = ({ encode }: EncodeContext) => {
            for (const { input, output } of [
                {
                    input: [97, 98, 99, 49, 50, 51],
                    output: 'abc123',
                },
                {
                    input: [],
                    output: '',
                },
                {
                    input: [0, 1, 50, 227, 145, 150],
                    output: '\u0000\u00012\u3456',
                },
            ]) {
                const bufInput = Buffer.from(input);
                const withDefault = encode.encode(bufInput);
                expect(withDefault).to.equal(output);
                expect(withDefault).to.equal(encode.encode(bufInput, 'utf8'));
            }
        };

        suite('browser', () => {
            const withBrowserEncode = before(() => ({
                encode: BrowserEncode,
            }));

            withBrowserEncode.test('base64', base64Test);
            withBrowserEncode.test('base64url', base64urlTest);
            withBrowserEncode.test('hex', hexTest);
            withBrowserEncode.test('utf8', utf8Test);
        });

        suite('node', () => {
            const withNodeEncode = before(() => ({
                encode: NodeEncode,
            }));

            withNodeEncode.test('base64', base64Test);
            withNodeEncode.test('base64url', base64urlTest);
            withNodeEncode.test('hex', hexTest);
            withNodeEncode.test('utf8', utf8Test);
        });
    });
});
