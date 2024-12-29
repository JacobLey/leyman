import type { ProjectGraph } from '@nx/devkit';
import { verifyAndRestore } from 'sinon';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { mockMethod } from 'sinon-typed-stub';
import { LifecycleCommand } from '../../../commands/lifecycle-command.js';
import type { ILifecycleInternal } from '../../../lifecycle/lifecycle-internal.js';
import { expect } from '../../chai-hooks.js';

suite('LifecycleCommand', () => {
    const stubs = beforeEach(() => {
        const mockedGetProjectGraph = mockMethod<() => Promise<ProjectGraph>>();
        const mockedLifecycleInternal = mockMethod<ILifecycleInternal>();

        return {
            mockedGetProjectGraph: mockedGetProjectGraph.mock,
            mockedLifecycleInternal: mockedLifecycleInternal.mock,
            lifecycleCommand: new LifecycleCommand(
                mockedGetProjectGraph.method,
                '<workspace-root>',
                mockedLifecycleInternal.method
            ),
        };
    });

    afterEach(() => {
        verifyAndRestore();
    });

    suite('handler', () => {
        stubs.test('success', async ctx => {
            ctx.mockedGetProjectGraph.resolves({
                nodes: {
                    foo: {
                        name: '<foo>',
                        data: {
                            root: '<foo-root>',
                        },
                    },
                    bar: {
                        name: '<bar>',
                        data: {
                            root: '<bar-root>',
                        },
                    },
                },
            });
            ctx.mockedLifecycleInternal.resolves();

            await ctx.lifecycleCommand.handler({
                configFile: '<config-file>',
                cwd: '<cwd>',
                ci: true,
                dryRun: false,
            });

            expect(ctx.mockedLifecycleInternal.callCount).to.equal(1);
            expect(ctx.mockedLifecycleInternal.getCall(0).args).to.deep.equal([
                {
                    configFile: '<config-file>',
                    cwd: '<cwd>',
                    check: true,
                    dryRun: false,
                },
                {
                    root: '<workspace-root>',
                    projects: [
                        {
                            root: '<foo-root>',
                            name: '<foo>',
                        },
                        {
                            root: '<bar-root>',
                            name: '<bar>',
                        },
                    ],
                },
            ]);
        });
    });
});
