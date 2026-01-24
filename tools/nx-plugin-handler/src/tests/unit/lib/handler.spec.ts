import type { ExecutorContext } from '@nx/devkit';
import type { GetForwardedHandler, RawHandler } from '../../../lib/forwarded-handler.js';
import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import { fake, verifyAndRestore } from 'sinon';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { stubMethod } from 'sinon-typed-stub';
import { Handler } from '../../../lib/handler.js';

suite('Handler', () => {
    afterEach(() => {
        verifyAndRestore();
    });

    const withContext = beforeEach(() => {
        const errorLogger = fake<unknown[], void>();
        const getForwardedHandler = stubMethod<GetForwardedHandler>();
        const stubbedHandler = stubMethod<RawHandler<unknown>>();

        return {
            errorLogger,
            stubbedHandler,
            getForwardedHandler: getForwardedHandler.stub,
            handler: new Handler(errorLogger, getForwardedHandler.method),
        };
    });

    const fakeContext = { root: '<root>' } as ExecutorContext;

    suite('handle', () => {
        suite('success', () => {
            withContext.test(
                'Proxies request to handler',
                async ({ handler, errorLogger, getForwardedHandler, stubbedHandler }) => {
                    getForwardedHandler.resolves(null);
                    stubbedHandler.stub.resolves({ success: true });

                    const handle = handler.handle(stubbedHandler.method);

                    expectTypeOf(handle).toEqualTypeOf(stubbedHandler.method);

                    const result = await handle({ foo: 123 }, fakeContext);

                    expect(getForwardedHandler.callCount).to.equal(1);
                    expect(getForwardedHandler.getCall(0).args).to.deep.equal([fakeContext]);
                    expect(stubbedHandler.stub.callCount).to.equal(1);
                    expect(stubbedHandler.stub.getCall(0).args).to.deep.equal([
                        { foo: 123 },
                        { root: '<root>', forwardedToProject: true },
                    ]);
                    expect(result).to.deep.equal({ success: true });
                    expectTypeOf(result).toEqualTypeOf<{ success: boolean }>();
                    expect(errorLogger.called).to.equal(false);
                }
            );

            withContext.test(
                'Uses forwarded handler',
                async ({ handler, errorLogger, getForwardedHandler, stubbedHandler }) => {
                    getForwardedHandler.resolves(stubbedHandler.method);
                    stubbedHandler.stub.resolves({ success: true });

                    const result = await handler.handle(async () => ({ success: false }))(
                        { foo: 123 },
                        fakeContext
                    );

                    expect(stubbedHandler.stub.callCount).to.equal(1);
                    expect(stubbedHandler.stub.getCall(0).args).to.deep.equal([
                        { foo: 123 },
                        { root: '<root>', forwardedToProject: true },
                    ]);
                    expect(result).to.deep.equal({ success: true });
                    expectTypeOf(result).toEqualTypeOf<{ success: boolean }>();
                    expect(errorLogger.called).to.equal(false);
                }
            );
        });

        suite('failure', () => {
            withContext.test(
                'Throws error',
                async ({ handler, errorLogger, getForwardedHandler, stubbedHandler }) => {
                    getForwardedHandler.resolves(null);
                    stubbedHandler.stub.rejects(new Error('<ERROR>'));

                    const handle = handler.handle(stubbedHandler.method);

                    const result = await handle({ foo: 123 }, fakeContext);

                    expect(result).to.deep.equal({ success: false });
                    expect(errorLogger.callCount).to.equal(1);
                    expect(errorLogger.firstCall.args).to.deep.equal(['<ERROR>']);
                }
            );

            withContext.test(
                'Throws anything but an error',
                async ({ handler, errorLogger, stubbedHandler }) => {
                    stubbedHandler.stub.returns(
                        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
                        Promise.reject('<just-some-error-text>')
                    );

                    const handle = handler.handle(stubbedHandler.method);

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
