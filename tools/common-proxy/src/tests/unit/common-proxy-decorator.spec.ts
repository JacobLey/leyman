import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import { suite, test } from 'mocha-chain';
import { commonProxyDecorator } from '../../common-proxy-decorator.cjs';
import { namedProxiedDecorators, proxiedDecorator } from '../fixtures/fixtures.cjs';

suite('commonProxyDecorator', () => {
    test('Handles default import', async () => {
        const handler = (a: unknown, b: unknown) => [a, b];
        const decoratedHandler = proxiedDecorator(handler, 3, 4);

        expect(await decoratedHandler(1, 2)).to.deep.equal([1, 2, 3, 4]);
        expectTypeOf(decoratedHandler).toEqualTypeOf<(...args: unknown[]) => Promise<unknown[]>>();
    });

    test('Handles named import', async () => {
        const handler = async (a: number, b: string) => ({ a, b });
        const decoratedHandler = namedProxiedDecorators.proxiedAsyncDecorator(handler, true);

        expect(await decoratedHandler(1, '2')).to.deep.equal({ a: 1, b: '2', c: true });
        expectTypeOf(decoratedHandler).toEqualTypeOf<
            (
                a: number,
                b: string
            ) => Promise<{
                a: number;
                b: string;
                c: boolean;
            }>
        >();
    });

    test('Dynamic method', async () => {
        const decorator =
            (handler: (a: number) => number): ((a: number) => number) =>
            (a: number) => {
                const original = handler(a);
                return original * 2;
            };
        const decoratorProxy = commonProxyDecorator(decorator);
        const decoratedHandler = decoratorProxy(a => a + 5);

        expectTypeOf(decoratedHandler).toEqualTypeOf<(a: number) => Promise<number>>();
        expect(await decoratedHandler(1)).to.equal(12);
    });

    test('Persists async generic', async () => {
        const genericAsyncDecorator =
            <B>(handler: <A>(a: A) => Promise<[A]>, b: B): (<A>(a: A) => Promise<[A, B]>) =>
            async a => {
                const [original] = await handler(a);
                return [original, b];
            };
        const genericAsyncDecoratorProxy = commonProxyDecorator(
            Promise.resolve(genericAsyncDecorator)
        );
        expectTypeOf(genericAsyncDecoratorProxy).toEqualTypeOf(genericAsyncDecorator);

        const decoratedGenericAsync = genericAsyncDecoratorProxy(async val => [val], 2 as const);
        type Expected = <A>(a: A) => Promise<[A, 2]>;
        expectTypeOf(decoratedGenericAsync).toEqualTypeOf<Expected>();

        expect(await decoratedGenericAsync('a')).to.deep.equal(['a', 2]);
    });
});
