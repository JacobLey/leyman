import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import { suite, test } from 'mocha-chain';
import type { events } from 'static-emitter';
import { CustomEvent } from 'static-emitter/custom-event';
import { StaticEventTarget } from 'static-emitter/static-event-target';
import { ExtendTarget, NativeEvent } from '../data/extend-event-target.js';
import { ServerEvent } from '../data/server-event.js';

suite('StaticEventTarget', () => {
    suite('success', () => {
        test('Unchanged EventTarget', () => {
            expect(StaticEventTarget).to.eq(EventTarget);
        });

        suite('Declare event types', () => {
            test('Generic parameter', () => {
                const extendTarget = new ExtendTarget();
                extendTarget.addEventListener('foo', event => {
                    expectTypeOf(event).toEqualTypeOf<CustomEvent<'foo', 123>>();
                });
                extendTarget.addEventListener('foo', {
                    handleEvent: event => {
                        expectTypeOf(event).toEqualTypeOf<CustomEvent<'foo', 123>>();
                    },
                });
                extendTarget.addEventListener('bar', event => {
                    expectTypeOf(event).toEqualTypeOf<ServerEvent<'bar'>>();
                });
                extendTarget.addEventListener('onStuff', event => {
                    expectTypeOf(event).toEqualTypeOf<NativeEvent>();
                });

                extendTarget.dispatchEvent(new CustomEvent('foo', { detail: 123 }));
                extendTarget.dispatchEvent(new ServerEvent('bar', '<server-data>'));
                extendTarget.dispatchEvent(new NativeEvent('onStuff'));
                extendTarget.dispatchEvent(
                    // @ts-expect-error
                    new CustomEvent('foo', { detail: 456 })
                );

                // eslint-disable-next-line unicorn/no-invalid-remove-event-listener
                extendTarget.removeEventListener('foo', event => {
                    expectTypeOf(event).toEqualTypeOf<CustomEvent<'foo', 123>>();
                });
                extendTarget.removeEventListener('bar', {
                    handleEvent: event => {
                        expectTypeOf(event).toEqualTypeOf<ServerEvent<'bar'>>();
                    },
                });
            });

            test('Explicit event declaration', () => {
                /**
                 * @override
                 */
                class ExtendTargetDeclare extends StaticEventTarget {
                    public declare [events]: {
                        foo: 123;
                        bar: ServerEvent<'bar'>;
                        onStuff: NativeEvent;
                    };
                }

                expectTypeOf(ExtendTargetDeclare).toMatchTypeOf(ExtendTarget);
            });

            test('Both generics and event param', () => {
                /**
                 * @override
                 */
                class ExtendTargetCombo extends StaticEventTarget<{
                    foo: 123;
                }> {
                    public declare [events]: StaticEventTarget<{
                        foo: 123;
                    }>[typeof events] & {
                        bar: ServerEvent<'bar'>;
                        onStuff: NativeEvent;
                    };
                }

                expectTypeOf(ExtendTargetCombo).toMatchTypeOf(ExtendTarget);
            });
        });
    });
});
