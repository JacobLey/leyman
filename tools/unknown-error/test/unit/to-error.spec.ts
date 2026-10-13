import { runInNewContext } from 'node:vm';
import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import { afterEach, beforeEach, suite, test } from 'mocha-chain';
import { getErrorMessage, hasCode, NonError, toError } from 'unknown-error';
import { hostileProxy, removeIsError, restoreIsError } from './helpers.js';

suite('to-error', () => {
    suite('NonError', () => {
        test('Describes and keeps the thrown value', () => {
            const thrown = { reason: 'nope' };
            const error = new NonError(thrown);

            expect(error).to.be.instanceOf(Error);
            expect(error.name).to.equal('NonError');
            expect(error.message).to.equal('{"reason":"nope"}');
            expect(error.thrown).to.equal(thrown);
        });

        test('Accepts standard Error options', () => {
            const cause = new Error('cause');
            const error = new NonError('thrown', { cause });
            expect(error.cause).to.equal(cause);
        });

        test('Truncates long messages', () => {
            const { message } = new NonError('x'.repeat(2000));
            expect(message).to.equal(`${'x'.repeat(1000)}…`);
        });

        test('Keeps messages at the limit whole', () => {
            const { message } = new NonError('x'.repeat(1000));
            expect(message).to.equal('x'.repeat(1000));
        });
    });

    suite('toError', () => {
        test('Returns type Error', () => {
            expectTypeOf(toError).returns.toEqualTypeOf<Error>();
        });

        suite('Errors', () => {
            test('Are returned as-is', () => {
                const error = new TypeError('boom');
                expect(toError(error)).to.equal(error);
            });

            test('From another realm are returned as-is', () => {
                const error: unknown = runInNewContext('new TypeError("x")');
                expect(error).not.to.be.instanceOf(Error);
                expect(toError(error)).to.equal(error);
            });

            test('Are not modified', () => {
                const error = new Error('x', { cause: 'not an error' });
                toError(error);
                expect(error.cause).to.equal('not an error');
            });

            test('Wrapped in a Proxy are rebuilt from what the Proxy shows', () => {
                const error = toError(new Proxy(new TypeError('proxied'), {}));
                expect(error.name).to.equal('TypeError');
                expect(error.message).to.equal('proxied');
            });
        });

        suite('Without Error.isError', () => {
            beforeEach(() => {
                removeIsError();
            });

            afterEach(() => {
                restoreIsError();
            });

            test('Errors from another realm are returned as-is', () => {
                const error: unknown = runInNewContext('new TypeError("x")');
                expect(toError(error)).to.equal(error);
            });

            test('Proxies that throw on every trap are still converted', () => {
                expect(toError(hostileProxy())).to.be.instanceOf(NonError);
            });

            test('hasCode still matches', () => {
                expect(
                    hasCode(Object.assign(new Error('x'), { code: 'ENOENT' }), 'ENOENT')
                ).to.equal(true);
            });
        });

        suite('Error-like objects', () => {
            test('Are rebuilt with their name, message and stack', () => {
                const stack = 'TypeError: m\n    at original (file.js:1:1)';
                const error = toError({ name: 'TypeError', message: 'm', stack });

                expect(error).to.be.instanceOf(Error);
                expect(error.name).to.equal('TypeError');
                expect(error.message).to.equal('m');
                expect(error.stack).to.equal(stack);
            });

            test('Keep other own properties, such as code', () => {
                const error = toError({ message: 'm', code: 'E_CODE', status: 500 });
                expect(error).to.include({ code: 'E_CODE', status: 500 });
            });

            test('Keep their cause', () => {
                const cause = { message: 'inner' };
                expect(toError({ message: 'outer', cause }).cause).to.equal(cause);
            });

            test('Keep an undefined cause', () => {
                expect(toError({ message: 'outer', cause: undefined })).to.have.property('cause');
            });

            test('Without a cause have none', () => {
                expect(toError({ message: 'outer' })).not.to.have.property('cause');
            });

            test('Ignore a name or stack that is not a string', () => {
                const error = toError({ message: 'm', name: 1, stack: 2 });
                expect(error.name).to.equal('Error');
                expect(error.stack).to.be.a('string');
            });

            test('Do not let a __proto__ key replace the prototype', () => {
                const error = toError(JSON.parse('{"message":"m","__proto__":{"polluted":true}}'));

                expect(Object.getPrototypeOf(error)).to.equal(Error.prototype);
                expect(error).not.to.have.property('polluted');
            });

            test('Do not overwrite inherited properties', () => {
                const error = toError({ message: 'm', toString: 'not a function' });
                expect(error.toString()).to.equal('Error: m');
            });

            test('Survive getters that throw', () => {
                const value = {
                    message: 'm',
                    get code(): never {
                        throw new Error('getter');
                    },
                };
                expect(toError(value)).to.have.property('code', undefined);
            });
        });

        suite('Other values', () => {
            test('Strings become the message', () => {
                const error = toError('boom');
                expect(error).to.be.instanceOf(NonError);
                expect(error.message).to.equal('boom');
            });

            test('Null and undefined', () => {
                expect(toError(null).message).to.equal('null');
                expect(toError(undefined).message).to.equal('undefined');
            });

            test('Objects without a string message are serialized', () => {
                const error = toError({ message: 42 });
                expect(error).to.be.instanceOf(NonError);
                expect(error.message).to.equal('{"message":42}');
            });

            test('Keep the original value', () => {
                const thrown = Symbol('thrown');
                expect(toError(thrown)).to.have.property('thrown', thrown);
            });

            test('Proxies that throw on every trap', () => {
                expect(toError(hostileProxy())).to.be.instanceOf(NonError);
            });
        });
    });

    suite('getErrorMessage', () => {
        test('Reads the message of an Error', () => {
            expect(getErrorMessage(new Error('boom'))).to.equal('boom');
        });

        test('Describes values that are not Errors', () => {
            expect(getErrorMessage({ id: 1 })).to.equal('{"id":1}');
        });

        test('Stringifies a message that is not a string', () => {
            const error = new Error('x');
            Object.defineProperty(error, 'message', { value: 42 });
            expect(getErrorMessage(error)).to.equal('42');
        });

        test('Survives a message getter that throws', () => {
            const error = new Error('x');
            Object.defineProperty(error, 'message', {
                get: () => {
                    throw new Error('getter');
                },
            });
            expect(getErrorMessage(error)).to.equal('[unreadable message]');
        });
    });

    suite('hasCode', () => {
        test('Matches an Error with the code', () => {
            expect(hasCode(Object.assign(new Error('x'), { code: 'ENOENT' }), 'ENOENT')).to.equal(
                true
            );
        });

        test('Matches numeric codes', () => {
            expect(hasCode(Object.assign(new Error('x'), { code: 404 }), 404)).to.equal(true);
        });

        test('Does not match a different code', () => {
            expect(hasCode(Object.assign(new Error('x'), { code: 'EACCES' }), 'ENOENT')).to.equal(
                false
            );
        });

        test('Does not match objects that are not Errors', () => {
            expect(hasCode({ code: 'ENOENT', message: 'x' }, 'ENOENT')).to.equal(false);
        });

        test('Survives a code getter that throws', () => {
            const error = Object.defineProperty(new Error('x'), 'code', {
                get: () => {
                    throw new Error('getter');
                },
            });
            expect(hasCode(error, 'ENOENT')).to.equal(false);
        });

        test('Narrows to an Error with that code', () => {
            // Inferred, so the expected type below comes from hasCode's narrowing alone
            const narrow = (value: unknown) => (hasCode(value, 'ENOENT') ? value : null);
            expectTypeOf(narrow).returns.toEqualTypeOf<
                (Error & { readonly code: 'ENOENT' }) | null
            >();
        });
    });
});
