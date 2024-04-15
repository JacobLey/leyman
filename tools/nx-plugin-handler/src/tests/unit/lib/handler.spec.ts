import type { ExecutorContext } from '@nx/devkit';
import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import { fake, match, verifyAndRestore } from 'sinon';
import { afterEach, beforeEach, suite } from 'mocha-hookup';
import { mockMethod } from 'sinon-typed-stub';
import { Handler, type RawHandler } from '#handler';

suite('Handler', () => {
    afterEach(() => {
        verifyAndRestore();
    });

    const context = beforeEach(() => {
        const errorLogger = fake<unknown[], void>();
        const handler = new Handler({
            error: errorLogger,
        });
        const mockedHandler = mockMethod<RawHandler<{ foo: number }>>();

        return {
            errorLogger,
            handler,
            mockedHandler,
        };
    });

    const fakeContext = {} as ExecutorContext;

    suite('handle', () => {
        suite('success', () => {
            context.test(
                'Proxies request to handler',
                async ({ handler, errorLogger, mockedHandler }) => {
                    mockedHandler.stub
                        .withArgs({ foo: 123 }, match.same(fakeContext))
                        .resolves({ success: true });

                    const handle = handler.handle(mockedHandler.method);

                    expectTypeOf(handle).toEqualTypeOf(mockedHandler.method);

                    const result = await handle({ foo: 123 }, fakeContext);

                    expect(result).to.deep.equal({ success: true });
                    expectTypeOf(result).toEqualTypeOf<{ success: boolean }>();
                    expect(errorLogger.called).to.equal(false);
                }
            );
        });

        suite('failure', () => {
            context.test('Throws error', async ({ handler, errorLogger, mockedHandler }) => {
                mockedHandler.stub.rejects(new Error('<ERROR>'));

                const handle = handler.handle(mockedHandler.method);

                const result = await handle({ foo: 123 }, fakeContext);

                expect(result).to.deep.equal({ success: false });
                expect(errorLogger.callCount).to.equal(1);
                expect(errorLogger.firstCall.args).to.deep.equal(['<ERROR>']);
            });

            context.test(
                'Throws anything but an error',
                async ({ handler, errorLogger, mockedHandler }) => {
                    mockedHandler.stub.returns(
                        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
                        Promise.reject('<just-some-error-text>')
                    );

                    const handle = handler.handle(mockedHandler.method);

                    const result = await handle({ foo: 123 }, fakeContext);

                    expect(result).to.deep.equal({ success: false });
                    expect(errorLogger.callCount).to.equal(1);
                    expect(errorLogger.firstCall.args).to.deep.equal([
                        'Unknown Error',
                        '<just-some-error-text>',
                    ]);
                }
            );
        });
    });
});
