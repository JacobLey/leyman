import { setTimeout } from 'node:timers/promises';
import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import { suite, test } from 'mocha-chain';
import { commonProxy } from '../../common-proxy.cjs';
import { proxiedHandler, proxiedMethods } from '../fixtures/fixtures.cjs';

suite('commonProxy', () => {
    test('Handles default import', async () => {
        expect(await proxiedHandler([123])).to.deep.equal({ num: 123 });
        expectTypeOf(proxiedHandler).toEqualTypeOf<(val: [number]) => Promise<{ num: number }>>();
    });

    test('Handles methods', async () => {
        expect(await proxiedMethods.addAllNums(1, 2, 3, 4)).to.equal(10);
        expectTypeOf(proxiedMethods.addAllNums).toEqualTypeOf<
            (...nums: number[]) => Promise<number>
        >();

        const delay = proxiedMethods.delayForLongestTime(5, 10, 15, 20);
        expect(await Promise.race([delay, setTimeout(10, '<FIRST>')])).to.equal('<FIRST>');
        expect(await Promise.race([delay.then(() => '<SECOND>'), setTimeout(20, '<NO>')])).to.equal(
            '<SECOND>'
        );
        expectTypeOf(proxiedMethods.delayForLongestTime).toEqualTypeOf<
            (...nums: number[]) => Promise<void>
        >();

        expect(await proxiedMethods.slowReverse('abcdef')).to.equal('fedcba');
        expectTypeOf(proxiedMethods.slowReverse).toEqualTypeOf<(str: string) => Promise<string>>();
    });

    test('Dynamic method', async () => {
        const myMethod = (a: string, b: string): number => a.length + b.length;
        const myMethodProxy = commonProxy(myMethod);
        expectTypeOf(myMethodProxy).toEqualTypeOf<(a: string, b: string) => Promise<number>>();
        expect(await myMethodProxy('abc', 'xyz123')).to.equal(9);

        const promiseOfMethod = Promise.resolve(
            async (a: number, ...rest: string[]): Promise<string> => rest.slice(0, a).join('-')
        );
        const proxiedPromise = commonProxy(promiseOfMethod);
        expectTypeOf(proxiedPromise).toEqualTypeOf<
            (a: number, ...rest: string[]) => Promise<string>
        >();
        expect(await proxiedPromise(3, 'abc', 'xyz', '123', '789')).to.equal('abc-xyz-123');
    });

    test('Persists async generic', async () => {
        const genericAsyncMethod = async <T>(a: T): Promise<{ foo: T }> => ({ foo: a });
        const genericAsyncMethodProxy = commonProxy(Promise.resolve(genericAsyncMethod));

        expectTypeOf(genericAsyncMethodProxy).toEqualTypeOf(genericAsyncMethod);

        const genericMethod = <T>(a: T): { foo: T } => ({ foo: a });
        const genericMethodProxy = commonProxy(genericMethod);

        expectTypeOf(genericMethodProxy).toEqualTypeOf<
            (a: unknown) => Promise<{
                foo: unknown;
            }>
        >();
    });
});
