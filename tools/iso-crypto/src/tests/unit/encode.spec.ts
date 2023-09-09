import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import { suite, test } from 'mocha-hookup';
import { decodeObject, encodeObject } from 'iso-crypto';

suite('EncodeObject', () => {

    suite('decodeObject', () => {

        test('success', () => {

            const myData = {
                foo: 'abcdef',
                bar: '012345',
            };
            const decoded = decodeObject(myData, 'hex');
            expect(decoded).to.deep.equal({
                foo: Buffer.from('abcdef', 'hex'),
                bar: Buffer.from('012345', 'hex'),
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
                foo: Buffer.from('<foo>'),
                bar: Buffer.from('<bar>'),
            });
            expectTypeOf(decoded).toEqualTypeOf<Record<string, Uint8Array>>();
        });
    });

    suite('encodeObject', () => {

        test('success', () => {

            const myData = {
                foo: Buffer.from('abcdef', 'hex'),
                bar: Buffer.from('012345', 'hex'),
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
                foo: Buffer.from('<foo>'),
                bar: Buffer.from('<bar>'),
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
