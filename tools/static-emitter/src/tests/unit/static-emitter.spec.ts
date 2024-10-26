import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import { suite, test } from 'mocha-chain';
import { CustomEvent, type events, StaticEmitter } from 'static-emitter';
import { CustomEmitter, eventSym } from '../data/custom-emitter.js';
import { ServerEvent } from '../data/server-event.js';

suite('StaticEmitter', () => {
    suite('success', () => {
        test('Extends EventTarget', () => {
            expect(new StaticEmitter()).to.be.an.instanceOf(EventTarget);
        });

        suite('Declare event types', () => {
            test('Generic parameter', () => {
                const customEmitter = new CustomEmitter();
                customEmitter.on('foo', (...args) => {
                    expectTypeOf(args).toEqualTypeOf<[123, CustomEvent<'foo', 123>]>();
                });
                customEmitter.addListener('foo', (...args) => {
                    expectTypeOf(args).toEqualTypeOf<[123, CustomEvent<'foo', 123>]>();
                });
                // @ts-expect-error
                customEmitter.on('bar', () => {});

                customEmitter.emit('foo', 123);
                customEmitter.emit(eventSym, { myData: '<my-data>' });
                customEmitter.emit(
                    // @ts-expect-error
                    'bar',
                    new ServerEvent('bar', '<server-data>')
                );

                customEmitter.off('foo', (detail: 123) => {
                    expectTypeOf(detail).toEqualTypeOf<123>();
                });
                // @ts-expect-error
                customEmitter.off('foo', (detail: 124) => {
                    expectTypeOf(detail).toEqualTypeOf<124>();
                });
                customEmitter.off('foo', {
                    handleEvent: detail => {
                        expectTypeOf(detail).toEqualTypeOf<CustomEvent<'foo', 123>>();
                    },
                });
                customEmitter.off('bar', event => {
                    expectTypeOf(event).toEqualTypeOf<ServerEvent<'bar'>>();
                });
                customEmitter.off('bar', event => {
                    expectTypeOf(event).toEqualTypeOf<ServerEvent<'bar'>>();
                });
                customEmitter.removeListener(eventSym, (...args) => {
                    expectTypeOf(args).toEqualTypeOf<
                        [{ myData: string }, CustomEvent<string, { myData: string }>]
                    >();
                });
            });

            test('Explicit event declaration', () => {
                /**
                 * @override
                 */
                class CustomEmitterDeclare extends StaticEmitter {
                    public declare [events]: {
                        foo: 123;
                        bar: ServerEvent<'bar'>;
                        [eventSym]: { myData: string };
                    };
                }

                expectTypeOf(CustomEmitterDeclare).toMatchTypeOf(CustomEmitter);
            });

            test('Both generics and event param', () => {
                /**
                 * @override
                 */
                class CustomEmitterCombo extends StaticEmitter<{
                    foo: 123 | 456;
                    bar: ServerEvent<'bar'>;
                }> {
                    public declare [events]: StaticEmitter<{
                        foo: 123 | 456;
                        bar: ServerEvent<'bar'>;
                    }>[typeof events] & {
                        foo: 123 | 789;
                        [eventSym]: { myData: string };
                    };
                }

                expectTypeOf(CustomEmitterCombo).toMatchTypeOf(CustomEmitter);
            });
        });

        test('Wrap custom event listeners', () => {
            let order = 0;

            const customEmitter = new CustomEmitter();

            const listener = (detail: number, event: CustomEvent<string, number>): void => {
                ++order;
                expect(order).to.equal(1);
                expect(detail).to.equal(123);
                expect(event).to.be.an.instanceOf(CustomEvent);
                expect(event.type).to.equal('foo');
                expect(event.detail).to.equal(123);
            };
            customEmitter.once('foo', listener);
            // Ignored
            customEmitter.once('foo', listener);
            customEmitter.emit('foo', 123);

            const handler = {
                handleEvent: (event: CustomEvent<'foo', 123>): void => {
                    ++order;
                    expect(order).to.equal(2);
                    expect(event).to.be.an.instanceOf(CustomEvent);
                    expect(event.type).to.equal('foo');
                    expect(event.detail).to.equal(123);
                },
            };
            customEmitter.addEventListener('foo', handler);
            customEmitter.emit('foo', 123);

            customEmitter.off('foo', handler);
            customEmitter.emit('foo', 123);

            customEmitter.addListener(eventSym, (detail, event) => {
                ++order;
                expect(order).to.equal(3);
                expect(detail).to.deep.equal({ myData: '<my-data>' });
                expect(event).to.be.an.instanceOf(CustomEvent);
                expect(event.detail).to.deep.equal({ myData: '<my-data>' });
            });
            customEmitter.emit(eventSym, { myData: '<my-data>' });

            customEmitter.off(eventSym, () => {});

            ++order;
            expect(order).to.equal(4);
        });
    });
});
