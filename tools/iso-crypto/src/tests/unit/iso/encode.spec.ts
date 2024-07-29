import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import * as IsoCrypto from 'iso-crypto';
import { suite, test } from 'mocha-chain';
import * as Encode from '#encode';

suite('Encode', () => {
    test('types', () => {
        expectTypeOf(IsoCrypto).toMatchTypeOf<typeof Encode>();
    });

    suite('decode', () => {
        test('base64', () => {
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
                    const buf = Encode.decode({
                        text: input,
                        encoding,
                    });
                    expect(buf).to.be.an.instanceOf(Uint8Array);
                    expect([...buf]).to.deep.equal(output);
                }
            }
        });

        test('hex', () => {
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
                    ...Encode.decode({
                        text: input,
                        encoding: 'hex',
                    }),
                ]).to.deep.equal(output);
            }
        });

        test('utf8', () => {
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
                const withDefault = Encode.decode(input);
                expect([...withDefault]).to.deep.equal(output);
                expect(withDefault).to.deep.equal(
                    Encode.decode({
                        text: input,
                        encoding: 'utf8',
                    })
                );
            }
        });

        test('raw', () => {
            for (const arr of [[1, 2, 3, 4], [97, 98, 99, 49, 50, 51], [0, 0, 0], []]) {
                const buf = Uint8Array.from(arr);
                expect(Encode.decode(buf)).to.eq(buf);
                expect(Encode.decode({ text: buf, encoding: 'raw' })).to.eq(buf);
            }
        });
    });

    suite('encode', () => {
        test('base64', () => {
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
                expect(Encode.encode(Uint8Array.from(input), 'base64')).to.equal(output);
            }
        });

        test('base64url', () => {
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
                expect(Encode.encode(Uint8Array.from(input), 'base64url')).to.equal(output);
            }
        });

        test('hex', () => {
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
                expect(Encode.encode(Uint8Array.from(input), 'hex')).to.equal(output);
            }
        });

        test('utf8', () => {
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
                const bufInput = Uint8Array.from(input);
                const withDefault = Encode.encode(bufInput);
                expect(withDefault).to.equal(output);
                expect(withDefault).to.equal(Encode.encode(bufInput, 'utf8'));
            }
        });
    });
});
