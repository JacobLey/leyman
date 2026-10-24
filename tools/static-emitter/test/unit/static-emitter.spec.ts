import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { StaticEmitter, StaticEventTarget, TypedCustomEvent } from 'static-emitter';
import { CustomEmitter } from '../data/custom-emitter.js';
import { ServerEvent } from '../data/server-event.js';

suite('StaticEmitter', () => {
    test('Extends StaticEventTarget', () => {
        expect(new StaticEmitter()).to.be.an.instanceOf(StaticEventTarget);
    });

    test('Only detail events are allowed in helpers', () => {
        const emitter = new CustomEmitter();

        // @ts-expect-error
        emitter.on('bar', () => {});
        // @ts-expect-error
        emitter.emit('bar', new ServerEvent('bar', '<server-data>'));
        // @ts-expect-error
        emitter.emit('foo', 456);
    });

    test('Subclasses can extend events via generic', () => {
        /**
         * @override
         * @template Events additional events
         */
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the generic is the extension point under test
        class BaseEmitter<Events extends Record<string, unknown>> extends StaticEmitter<
            Events & { base: string }
        > {}
        /**
         * @override
         */
        class ChildEmitter extends BaseEmitter<{ child: number }> {}

        const emitter = new ChildEmitter();
        emitter.on('base', detail => {
            expectTypeOf(detail).toEqualTypeOf<string>();
        });
        emitter.on('child', detail => {
            expectTypeOf(detail).toEqualTypeOf<number>();
        });
    });

    test('Events can be an interface', () => {
        interface Events {
            data: string;
            server: ServerEvent<'server'>;
        }
        const emitter = new StaticEmitter<Events>();
        const received: string[] = [];

        emitter.on('data', detail => {
            expectTypeOf(detail).toEqualTypeOf<string>();
            received.push(detail);
        });
        emitter.emit('data', '<data>');

        expect(received).to.deep.equal(['<data>']);
    });

    suite('on', () => {
        test('Receives detail and event', () => {
            const emitter = new CustomEmitter();
            const received: unknown[] = [];

            emitter.on('data', (detail, event) => {
                expectTypeOf(detail).toEqualTypeOf<{ myData: string }>();
                expectTypeOf(event).toEqualTypeOf<TypedCustomEvent<'data', { myData: string }>>();
                received.push(detail, event.type, event instanceof TypedCustomEvent);
            });
            emitter.emit('data', { myData: '<my-data>' });

            expect(received).to.deep.equal([{ myData: '<my-data>' }, 'data', true]);
        });

        test('Visible to native listeners', () => {
            const emitter = new CustomEmitter();
            const received: number[] = [];

            emitter.addEventListener('foo', event => {
                received.push(event.detail);
            });
            emitter.emit('foo', 123);

            expect(received).to.deep.equal([123]);
        });

        test('Registers the same listener each time', () => {
            const emitter = new CustomEmitter();
            let count = 0;
            const listener = (): void => {
                ++count;
            };

            emitter.on('foo', listener);
            emitter.on('foo', listener);
            emitter.emit('foo', 123);

            expect(count).to.equal(2);
        });

        test('Returns unsubscribe', () => {
            const emitter = new CustomEmitter();
            let count = 0;

            const unsubscribe = emitter.on('foo', () => {
                ++count;
            });
            emitter.emit('foo', 123);
            unsubscribe();
            emitter.emit('foo', 123);

            expect(count).to.equal(1);
        });

        test('Unsubscribes on abort', () => {
            const emitter = new CustomEmitter();
            const controller = new AbortController();
            let count = 0;

            emitter.on(
                'foo',
                () => {
                    ++count;
                },
                { signal: controller.signal }
            );
            controller.abort();
            emitter.emit('foo', 123);

            expect(count).to.equal(0);
        });
    });

    suite('once', () => {
        test('Only invoked once', () => {
            const emitter = new CustomEmitter();
            let count = 0;

            emitter.once('foo', () => {
                ++count;
            });
            emitter.emit('foo', 123);
            emitter.emit('foo', 123);

            expect(count).to.equal(1);
        });
    });

    suite('next', () => {
        test('Resolves with next detail', async () => {
            const emitter = new CustomEmitter();

            const next = emitter.next('data');
            emitter.emit('data', { myData: '<my-data>' });

            expectTypeOf(next).toEqualTypeOf<Promise<{ myData: string }>>();
            await expect(next).to.eventually.deep.equal({ myData: '<my-data>' });
        });

        test('Releases signal after resolving', async () => {
            const emitter = new CustomEmitter();
            const controller = new AbortController();

            const next = emitter.next('foo', { signal: controller.signal });
            emitter.emit('foo', 123);
            controller.abort();

            await expect(next).to.eventually.equal(123);
        });

        test('Rejects when aborted', async () => {
            const emitter = new CustomEmitter();
            const controller = new AbortController();
            const reason = new Error('<aborted>');

            const next = emitter.next('foo', { signal: controller.signal });
            controller.abort(reason);

            await expect(next).to.be.rejectedWith(reason);
        });

        test('Rejects when already aborted', async () => {
            const emitter = new CustomEmitter();
            const reason = new Error('<aborted>');

            await expect(
                emitter.next('foo', { signal: AbortSignal.abort(reason) })
            ).to.be.rejectedWith(reason);
        });
    });

    suite('emit', () => {
        test('Detail is optional when it accepts undefined', () => {
            const emitter = new CustomEmitter();
            const received: unknown[] = [];

            emitter.on('ready', detail => {
                received.push(detail);
            });
            emitter.emit('ready');

            expect(received).to.deep.equal([undefined]);
        });

        test('Detail is otherwise required', () => {
            const emitter = new CustomEmitter();

            // @ts-expect-error
            emitter.emit('foo');
        });
    });
});
