import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { TypedEvent } from 'static-emitter/typed-event';

suite('TypedEvent', () => {
    test('Extends Event', () => {
        expect(new TypedEvent('abc')).to.be.an.instanceOf(Event);
    });

    test('Binds event name', () => {
        const event = new TypedEvent('abc', { cancelable: true });
        expectTypeOf(event.type).toEqualTypeOf<'abc'>();
        expect(event.type).to.equal('abc');
        expect(event.cancelable).to.equal(true);
    });
});
