import type { ProjectGraph } from '@nx/devkit';
import { verifyAndRestore } from 'sinon';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { stubMethod } from 'sinon-typed-stub';
import { GenerateCommand } from '../../../commands/generate-command.js';
import type { NxDagger } from '../../../generate/nx-dagger.js';
import { expect } from '../../chai-hooks.js';

suite('LifecycleCommand', () => {
    const stubs = beforeEach(() => {
        const stubbedGetProjectGraph = stubMethod<() => Promise<ProjectGraph>>();
        const stubbedNxDagger = stubMethod<NxDagger>();

        return {
            stubbedGetProjectGraph: stubbedGetProjectGraph.stub,
            stubbedNxDagger: stubbedNxDagger.stub,
            generateCommand: new GenerateCommand(
                stubbedGetProjectGraph.method,
                stubbedNxDagger.method
            ),
        };
    });

    afterEach(() => {
        verifyAndRestore();
    });

    suite('handler', () => {
        stubs.test('success', async ctx => {
            ctx.stubbedGetProjectGraph.resolves({
                nodes: {},
                dependencies: {},
            });
            ctx.stubbedNxDagger.resolves();

            await ctx.generateCommand.handler({
                configFile: '<config-file>',
                cwd: '<cwd>',
                ci: true,
                dryRun: false,
            });

            expect(ctx.stubbedNxDagger.callCount).to.equal(1);
            expect(ctx.stubbedNxDagger.getCall(0).args).to.deep.equal([
                {
                    nodes: {},
                    dependencies: {},
                },
                {
                    configFile: '<config-file>',
                    cwd: '<cwd>',
                    check: true,
                    dryRun: false,
                },
            ]);
        });
    });
});
