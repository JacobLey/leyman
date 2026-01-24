import type { CreateRequire, Importer } from '../../../lib/dependencies.js';
import type { PluginContext } from '../../../lib/forwarded-handler.js';
import { expect } from 'chai';
import { verifyAndRestore } from 'sinon';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { stubMethod } from 'sinon-typed-stub';
import { ForwardedHandler } from '../../../lib/forwarded-handler.js';

suite('ForwardedHandler', () => {
    afterEach(() => {
        verifyAndRestore();
    });

    const withContext = beforeEach(() => {
        const stubbedCreateRequire = stubMethod<CreateRequire>();
        const stubbedImporter = stubMethod<Importer>();
        const stubbedRequireResolve = stubMethod<globalThis.NodeJS.RequireResolve>();

        stubbedCreateRequire.stub.returns({ resolve: stubbedRequireResolve.method });

        return {
            stubbedCreateRequire: stubbedCreateRequire.stub,
            stubbedImporter: stubbedImporter.stub,
            stubbedRequireResolve: stubbedRequireResolve.stub,
            forwardedHandler: new ForwardedHandler(
                stubbedCreateRequire.method,
                stubbedImporter.method
            ),
            pluginContext: {
                cwd: '/current/working/directory',
                target: {
                    executor: '<plugin-package-name>:<plugin-executor-name>',
                },
            } as PluginContext,
        };
    });

    suite('getForwardedHandler', () => {
        withContext.test('success', async ctx => {
            ctx.stubbedRequireResolve
                .withArgs('<plugin-package-name>/package.json')
                .returns('/path/to/plugin/package.json');

            ctx.stubbedImporter
                .withArgs('/path/to/plugin/package.json', {
                    with: { type: 'json' },
                })
                .resolves({
                    [Symbol.toStringTag]: 'Module',
                    default: {
                        executors: './executors.json',
                    },
                });

            ctx.stubbedImporter
                .withArgs('/path/to/plugin/executors.json', {
                    with: { type: 'json' },
                })
                .resolves({
                    [Symbol.toStringTag]: 'Module',
                    default: {
                        executors: {
                            '<plugin-executor-name>': {
                                implementation: './implementation/index.js',
                            },
                        },
                    },
                });

            const fakeHandler = () => {};

            ctx.stubbedImporter.withArgs('/path/to/plugin/implementation/index.js').resolves({
                [Symbol.toStringTag]: 'Module',
                default: fakeHandler,
            });

            const handler = await ctx.forwardedHandler.getForwardedHandler(ctx.pluginContext);

            expect(handler).to.eq(fakeHandler);

            expect(ctx.stubbedCreateRequire.callCount).to.equal(1);
            expect(ctx.stubbedCreateRequire.getCall(0).args).to.deep.equal([
                '/current/working/directory/project.json',
            ]);
        });

        withContext.test('Handler already proxied', async ctx => {
            const handler = await ctx.forwardedHandler.getForwardedHandler({
                ...ctx.pluginContext,
                forwardedToProject: true,
            });

            expect(handler).to.eq(null);

            expect(ctx.stubbedCreateRequire.callCount).to.equal(0);
        });

        withContext.test('No executor found', async ctx => {
            ctx.stubbedRequireResolve.returns('/path/to/plugin/package.json');

            ctx.stubbedImporter
                .withArgs('/path/to/plugin/package.json', {
                    with: { type: 'json' },
                })
                .resolves({
                    [Symbol.toStringTag]: 'Module',
                    default: {
                        executors: './executors.json',
                    },
                });

            ctx.stubbedImporter
                .withArgs('/path/to/plugin/executors.json', {
                    with: { type: 'json' },
                })
                .resolves({
                    [Symbol.toStringTag]: 'Module',
                    default: {
                        '<some-other-executor>': {
                            implementation: './implementation/index.js',
                        },
                    },
                });

            const handler = await ctx.forwardedHandler.getForwardedHandler(ctx.pluginContext);

            expect(handler).to.eq(null);
        });

        withContext.test('Invalid executors.json', async ctx => {
            ctx.stubbedRequireResolve.returns('/path/to/plugin/package.json');

            ctx.stubbedImporter
                .withArgs('/path/to/plugin/package.json', {
                    with: { type: 'json' },
                })
                .resolves({
                    [Symbol.toStringTag]: 'Module',
                    default: {
                        executors: './executors.json',
                    },
                });

            ctx.stubbedImporter
                .withArgs('/path/to/plugin/executors.json', {
                    with: { type: 'json' },
                })
                .resolves({
                    [Symbol.toStringTag]: 'Module',
                    default: {
                        foo: '<bar>',
                    },
                });

            const handler = await ctx.forwardedHandler.getForwardedHandler(ctx.pluginContext);

            expect(handler).to.eq(null);
        });

        withContext.test('Invalid package.json', async ctx => {
            ctx.stubbedRequireResolve.returns('/path/to/plugin/package.json');

            ctx.stubbedImporter
                .withArgs('/path/to/plugin/package.json', {
                    with: { type: 'json' },
                })
                .resolves({
                    [Symbol.toStringTag]: 'Module',
                    default: {
                        name: '<name>',
                    },
                });

            const handler = await ctx.forwardedHandler.getForwardedHandler(ctx.pluginContext);

            expect(handler).to.eq(null);
        });

        withContext.test('Unexpected error when loading', async ctx => {
            ctx.stubbedRequireResolve.returns('/path/to/plugin/package.json');

            ctx.stubbedImporter
                .withArgs('/path/to/plugin/package.json', {
                    with: { type: 'json' },
                })
                .rejects(new Error('<error>'));

            const handler = await ctx.forwardedHandler.getForwardedHandler(ctx.pluginContext);

            expect(handler).to.eq(null);
        });
    });
});
