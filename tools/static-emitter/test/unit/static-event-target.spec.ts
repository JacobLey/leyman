import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { StaticEventTarget } from 'static-emitter/static-event-target';
import { TypedCustomEvent } from 'static-emitter/typed-custom-event';
import { ExtendTarget, NativeEvent } from '../data/extend-event-target.js';
import { ServerEvent } from '../data/server-event.js';

suite('StaticEventTarget', () => {
    test('Extends EventTarget', () => {
        const target = new StaticEventTarget();

        expect(target).to.be.an.instanceOf(EventTarget);
        expectTypeOf(target).toExtend<EventTarget>();
    });

    test('Types listeners by event name', () => {
        const target = new ExtendTarget();

        target.addEventListener('foo', event => {
            expectTypeOf(event).toEqualTypeOf<TypedCustomEvent<'foo', 123>>();
        });
        target.addEventListener('foo', {
            handleEvent: event => {
                expectTypeOf(event).toEqualTypeOf<TypedCustomEvent<'foo', 123>>();
            },
        });
        target.addEventListener('bar', event => {
            expectTypeOf(event).toEqualTypeOf<ServerEvent<'bar'>>();
        });
        target.addEventListener('onStuff', event => {
            expectTypeOf(event).toEqualTypeOf<NativeEvent>();
        });
        // @ts-expect-error
        target.addEventListener('unknown', () => {});
    });

    test('Types dispatched events', () => {
        const target = new ExtendTarget();

        target.dispatchEvent(new TypedCustomEvent('foo', { detail: 123 }));
        target.dispatchEvent(new ServerEvent('bar', '<server-data>'));
        target.dispatchEvent(new NativeEvent('onStuff'));
        // @ts-expect-error
        target.dispatchEvent(new TypedCustomEvent('foo', { detail: 456 }));
        // @ts-expect-error
        target.dispatchEvent(new ServerEvent('foo', '<server-data>'));
    });

    test('Dispatches to and removes native listeners', () => {
        const target = new ExtendTarget();
        const received: string[] = [];
        const listener = (event: ServerEvent<'bar'>): void => {
            received.push(event.serverData);
        };

        target.addEventListener('bar', listener);
        target.dispatchEvent(new ServerEvent('bar', '<first>'));
        target.removeEventListener('bar', listener);
        target.dispatchEvent(new ServerEvent('bar', '<second>'));

        expect(received).to.deep.equal(['<first>']);
    });

    test('Returns whether default was prevented', () => {
        const target = new ExtendTarget();
        target.addEventListener('onStuff', event => {
            event.preventDefault();
        });

        expect(target.dispatchEvent(new NativeEvent('onStuff', { cancelable: true }))).to.equal(
            false
        );
    });
});
