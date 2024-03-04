import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import { suite, test } from 'mocha-hookup';
import { CustomEvent as TypedCustomEvent } from 'static-emitter/custom-event';

suite('CustomEvent', () => {
    suite('success', () => {
        test('Conforms to native CustomEvent types', () => {
            const event: CustomEvent<123> = new TypedCustomEvent('abc', {
                detail: 123,
            });

            expectTypeOf(event).toMatchTypeOf<TypedCustomEvent<string, 123>>();
        });

        test('Extends Event', () => {
            expect(new TypedCustomEvent('abc')).to.be.an.instanceOf(Event);
        });

        test('Requires type and detail', () => {
            expectTypeOf<TypedCustomEvent<'abc', 123>>(
                new TypedCustomEvent('abc', { detail: 123 })
            );
        });

        test('Only null detail is optional', () => {
            const customEvent = new TypedCustomEvent('abc');
            expectTypeOf(customEvent).toEqualTypeOf<TypedCustomEvent<'abc'>>();
            expectTypeOf(customEvent.detail).toBeNull();

            expectTypeOf<TypedCustomEvent<'abc', 123>>(
                // @ts-expect-error
                new TypedCustomEvent('abc')
            );
        });

        test('Detail is readonly', () => {
            const customEvent = new TypedCustomEvent('abc', { detail: 123 });

            expect(() => {
                // @ts-expect-error
                customEvent.detail = 123;
            }).to.throw(TypeError);
        });
    });
});
