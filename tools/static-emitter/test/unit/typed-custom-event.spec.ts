import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { TypedCustomEvent } from 'static-emitter/typed-custom-event';

suite('TypedCustomEvent', () => {
    test('Conforms to native CustomEvent', () => {
        const event: CustomEvent<123> = new TypedCustomEvent('abc', { detail: 123 });

        expect(event).to.be.an.instanceOf(CustomEvent);
    });

    test('Binds event name and detail', () => {
        const event = new TypedCustomEvent('abc', { detail: 123 });

        expectTypeOf(event).toEqualTypeOf<TypedCustomEvent<'abc', number>>();
        expect(event.type).to.equal('abc');
        expect(event.detail).to.equal(123);
    });

    test('Only null detail is optional', () => {
        const event = new TypedCustomEvent('abc');

        expectTypeOf(event.detail).toBeNull();
        expect(event.detail).to.equal(null);

        expectTypeOf<TypedCustomEvent<'abc', 123>>(
            // @ts-expect-error
            new TypedCustomEvent('abc')
        );
    });

    test('Preserves undefined detail', () => {
        const event = new TypedCustomEvent<'abc', undefined>('abc', { detail: undefined });

        expect(event.detail).to.equal(undefined);
    });

    test('Detail is readonly', () => {
        const event = new TypedCustomEvent('abc', { detail: 123 });

        expect(() => {
            // @ts-expect-error
            event.detail = 456;
        }).to.throw(TypeError);
    });
});
