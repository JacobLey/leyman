import { suite, test } from 'mocha';
import { expect } from '@leyman/expect';
import { identifier } from 'haywire';
import * as publicErrors from 'haywire';
import * as errors from '#errors';

suite('errors', () => {
    test('Every error class is exported', () => {
        const errorClasses = Object.entries(errors).filter(([name]) => name.startsWith('Haywire'));
        expect(errorClasses).to.have.length(17);
        for (const [name, errorClass] of errorClasses) {
            expect(publicErrors).to.have.property(name, errorClass);
        }
    });

    test('Request path is not enumerable', () => {
        const path = [identifier<string>('A'), identifier<string>('B')];
        const error = new errors.HaywireNullResponseError(path[1]!, path);
        expect(error.requestPath).to.equal(path);
        expect(Object.keys(error)).to.not.include('requestPath');
    });

    test('Values that cannot be stringified still produce a message', () => {
        class Foo {
            public readonly foo = true;
        }
        const id = identifier(Foo);
        const circular: Record<string, unknown> = {};
        circular.self = circular;

        for (const [value, described] of [
            [circular, 'object'],
            [1n, 'bigint'],
            [() => {}, 'function'],
            [Object.create(null), '{}'],
            [{ a: 1 }, '{"a":1}'],
            [new Map(), 'Map'],
        ] as const) {
            expect(new errors.HaywireInstanceOfResponseError(id, value)).to.include({
                message: `Value ${described} returned by provider is not instance of class: Foo`,
            });
        }

        const unprintable: unknown = Object.create(null);
        expect(new errors.HaywireProviderError(id, unprintable)).to.include({
            message: 'Provider for Foo failed: object',
        });
        expect(new errors.HaywireMultiError([unprintable, new Error('<message>'), 123])).to.include(
            {
                message: 'Multiple errors: [object, <message>, 123]',
            }
        );
    });
});
