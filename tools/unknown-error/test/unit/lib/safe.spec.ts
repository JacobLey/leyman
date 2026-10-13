import { runInNewContext } from 'node:vm';
import { expect } from '@leyman/expect';
import { afterEach, beforeEach, suite, test } from 'mocha-chain';
import { hasProperty, isError, isObject, safeGet, safeKeys, safeStringify } from '#safe';
import { hostileProxy, removeIsError, restoreIsError } from '../helpers.js';

class CustomError extends Error {
    public override name = 'CustomError';
}

/**
 * An object that claims to be an Error through its tag alone.
 *
 * @returns the forged object
 */
const forgedTag = (): object => ({ [Symbol.toStringTag]: 'Error' });

suite('safe', () => {
    suite('isObject', () => {
        test('Objects and functions can have properties', () => {
            expect(isObject({})).to.equal(true);
            expect(isObject([])).to.equal(true);
            expect(isObject(() => null)).to.equal(true);
        });

        test('Primitives and null cannot', () => {
            expect(isObject(null)).to.equal(false);
            expect(isObject('string')).to.equal(false);
            expect(isObject(1)).to.equal(false);
        });
    });

    suite('isError', () => {
        suite('With Error.isError', () => {
            test('Errors and their subclasses', () => {
                expect(isError(new Error('x'))).to.equal(true);
                expect(isError(new TypeError('x'))).to.equal(true);
                expect(isError(new CustomError('x'))).to.equal(true);
            });

            test('Errors from another realm', () => {
                expect(isError(runInNewContext('new TypeError("x")'))).to.equal(true);
            });

            test('Not error-like objects, Proxies or forged tags', () => {
                expect(isError({ name: 'Error', message: 'x' })).to.equal(false);
                expect(isError(new Proxy(new Error('x'), {}))).to.equal(false);
                expect(isError(forgedTag())).to.equal(false);
            });

            test('Not primitives', () => {
                expect(isError('Error: x')).to.equal(false);
                expect(isError(null)).to.equal(false);
            });
        });

        suite('Without Error.isError', () => {
            beforeEach(() => {
                removeIsError();
            });

            afterEach(() => {
                restoreIsError();
            });

            test('Errors and their subclasses', () => {
                expect(isError(new Error('x'))).to.equal(true);
                expect(isError(new TypeError('x'))).to.equal(true);
                expect(isError(new CustomError('x'))).to.equal(true);
            });

            test('Errors from another realm, by their tag', () => {
                expect(isError(runInNewContext('new TypeError("x")'))).to.equal(true);
            });

            test('Proxies around an Error pass', () => {
                expect(isError(new Proxy(new Error('x'), {}))).to.equal(true);
            });

            test('Forged tags pass', () => {
                expect(isError(forgedTag())).to.equal(true);
            });

            test('Not error-like objects', () => {
                expect(isError({ name: 'Error', message: 'x' })).to.equal(false);
            });

            test('Not primitives', () => {
                expect(isError('Error: x')).to.equal(false);
                expect(isError(null)).to.equal(false);
            });

            test('Proxies that throw on every trap are not Errors', () => {
                expect(isError(hostileProxy())).to.equal(false);
            });

            test('Uses a polyfill added later', () => {
                Object.defineProperty(Error, 'isError', {
                    configurable: true,
                    value: (value: unknown) => value === 'polyfilled',
                });
                expect(isError('polyfilled')).to.equal(true);
            });
        });
    });

    suite('safeGet', () => {
        test('Reads a property', () => {
            expect(safeGet({ a: 1 }, 'a')).to.equal(1);
        });

        test('Returns undefined when the getter throws', () => {
            expect(safeGet(hostileProxy(), 'a')).to.equal(undefined);
        });
    });

    suite('hasProperty', () => {
        test('Finds own and inherited properties', () => {
            expect(hasProperty({ a: 1 }, 'a')).to.equal(true);
            expect(hasProperty({}, 'toString')).to.equal(true);
            expect(hasProperty({}, 'a')).to.equal(false);
        });

        test('Returns false when the has trap throws', () => {
            expect(hasProperty(hostileProxy(), 'a')).to.equal(false);
        });
    });

    suite('safeKeys', () => {
        test('Lists own enumerable keys', () => {
            expect(safeKeys({ a: 1, b: 2 })).to.deep.equal(['a', 'b']);
        });

        test('Returns no keys when the ownKeys trap throws', () => {
            expect(safeKeys(hostileProxy())).to.deep.equal([]);
        });
    });

    suite('safeStringify', () => {
        test('Strings are returned as-is', () => {
            expect(safeStringify('boom')).to.equal('boom');
        });

        test('Primitives use String()', () => {
            expect(safeStringify(null)).to.equal('null');
            expect(safeStringify(undefined)).to.equal('undefined');
            expect(safeStringify(42)).to.equal('42');
            expect(safeStringify(false)).to.equal('false');
            expect(safeStringify(Symbol('sym'))).to.equal('Symbol(sym)');
        });

        test('BigInts keep their n suffix', () => {
            expect(safeStringify(1n)).to.equal('1n');
        });

        suite('Functions', () => {
            test('Named functions show their name, not their source', () => {
                const namedFunction = (): null => null;
                expect(safeStringify(namedFunction)).to.equal('[Function namedFunction]');
            });

            test('Anonymous functions', () => {
                expect(
                    safeStringify(Object.defineProperty(() => null, 'name', { value: '' }))
                ).to.equal('[Function (anonymous)]');
            });

            test('Functions whose name is not a string', () => {
                expect(
                    safeStringify(Object.defineProperty(() => null, 'name', { value: 1 }))
                ).to.equal('[Function (anonymous)]');
            });
        });

        suite('Objects', () => {
            test('Serialized as JSON', () => {
                expect(safeStringify({ a: [1, 'b'] })).to.equal('{"a":[1,"b"]}');
            });

            test('Nested BigInts', () => {
                expect(safeStringify({ n: 1n })).to.equal('{"n":"1n"}');
            });

            test('Circular references are marked', () => {
                const value: Record<string, unknown> = { id: 7 };
                value.self = value;
                expect(safeStringify(value)).to.equal('{"id":7,"self":"[Circular]"}');
            });

            test('An object referenced twice without a cycle is printed both times', () => {
                const shared = { x: 1 };
                expect(safeStringify({ a: shared, b: [shared] })).to.equal(
                    '{"a":{"x":1},"b":[{"x":1}]}'
                );
            });

            test('Falls back to toString when toJSON returns nothing', () => {
                expect(
                    safeStringify({
                        toJSON: () => {},
                        toString: () => 'custom',
                    })
                ).to.equal('custom');
            });

            test('Falls back to toString when toJSON throws', () => {
                expect(
                    safeStringify({
                        toJSON: () => {
                            throw new Error('toJSON');
                        },
                        toString: () => 'custom',
                    })
                ).to.equal('custom');
            });

            test('Falls back to the object tag when toString also throws', () => {
                expect(
                    safeStringify({
                        toJSON: () => {
                            throw new Error('toJSON');
                        },
                        toString: () => {
                            throw new Error('toString');
                        },
                    })
                ).to.equal('[object Object]');
            });

            test('Proxies that throw on every trap', () => {
                expect(safeStringify(hostileProxy())).to.equal('[unprintable value]');
            });
        });
    });
});
