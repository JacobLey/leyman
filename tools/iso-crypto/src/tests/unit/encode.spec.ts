import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import { decode, decodeObject, encodeObject } from 'iso-crypto';
import { suite, test } from 'mocha-hookup';

suite('EncodeObject', () => {
    suite('decodeObject', () => {
        test('success', () => {
            const myData = {
                foo: 'abcdef',
                bar: '012345',
            };
            const decoded = decodeObject(myData, 'hex');
            expect(decoded).to.deep.equal({
                foo: decode({ text: 'abcdef', encoding: 'hex' }),
                bar: decode({ text: '012345', encoding: 'hex' }),
            });
            expectTypeOf(decoded).toEqualTypeOf<{
                foo: Uint8Array;
                bar: Uint8Array;
            }>();
        });

        test('Default utf8', () => {
            const myData: Record<string, string> = {
                foo: '<foo>',
                bar: '<bar>',
            };
            const decoded = decodeObject(myData);
            expect(decoded).to.deep.equal({
                foo: decode('<foo>'),
                bar: decode('<bar>'),
            });
            expectTypeOf(decoded).toEqualTypeOf<Record<string, Uint8Array>>();
        });
    });

    suite('encodeObject', () => {
        test('success', () => {
            const myData = {
                foo: decode({ text: 'abcdef', encoding: 'hex' }),
                bar: decode({ text: '012345', encoding: 'hex' }),
            };
            const encoded = encodeObject(myData, 'hex');
            expect(encoded).to.deep.equal({
                foo: 'abcdef',
                bar: '012345',
            });
            expectTypeOf(encoded).toEqualTypeOf<{
                foo: string;
                bar: string;
            }>();
        });

        test('Default utf8', () => {
            const myData: Record<string, Uint8Array> = {
                foo: decode('<foo>'),
                bar: decode('<bar>'),
            };
            const encoded = encodeObject(myData);
            expect(encoded).to.deep.equal({
                foo: '<foo>',
                bar: '<bar>',
            });
            expectTypeOf(encoded).toEqualTypeOf<Record<string, string>>();
        });
    });
});
