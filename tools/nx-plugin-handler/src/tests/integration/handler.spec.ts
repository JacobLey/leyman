import Path from 'node:path';
import { expect } from 'chai';
import { suite, test } from 'mocha-chain';
import { handler, type PluginContext, type RawHandler } from 'nx-plugin-handler';
import { mockMethod } from 'sinon-typed-stub';

suite('handler', () => {
    test('Wraps original handler when already forwarded', async () => {
        const mockHandler = mockMethod<RawHandler<{ foo: string }>>();
        mockHandler.mock.resolves({ success: true });

        const wrappedHandler = handler(mockHandler.method);
        const params = { foo: '<bar>' };
        const context = { forwardedToProject: true } as PluginContext;
        expect(await wrappedHandler(params, context)).to.deep.equal({ success: true });

        expect(mockHandler.mock.callCount).to.equal(1);
        expect(mockHandler.mock.getCall(0).args).to.deep.equal([params, context]);
    });

    test('Forwards request to real handler', async () => {
        const wrappedHandler = handler(async () => ({ success: false }));
        expect(
            await wrappedHandler({}, {
                cwd: Path.join(import.meta.dirname, '../../../src/tests/data/fake-plugin'),
                target: {
                    executor: 'fake-plugin:fake-executor',
                },
            } as PluginContext)
        ).to.deep.equal({ success: true });
    });
});
