import { expect } from 'chai';
import { createStubInstance, verifyAndRestore } from 'sinon';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import type { ParseCwd } from 'parse-cwd';
import { stubMethod } from 'sinon-typed-stub';
import { BarrelCommand } from '../../../commands/barrel-command.js';
import { Barrel } from '../../../lib/barrel.js';
import type { ConsoleLog } from '../../../lib/dependencies.js';

suite('BarrelCommand', () => {
    afterEach(() => {
        verifyAndRestore();
    });

    const withStubs = beforeEach(() => {
        const stubbedBarrel = createStubInstance(Barrel);
        const stubbedLogger = stubMethod<ConsoleLog>();
        const stubbedParseCwd = stubMethod<ParseCwd>();
        return {
            stubbedBarrel,
            stubbedLogger: stubbedLogger.stub,
            stubbedParseCwd: stubbedParseCwd.stub,
            barrelCommand: new BarrelCommand(
                stubbedBarrel,
                stubbedLogger.method,
                stubbedParseCwd.method
            ),
        };
    });

    suite('handler', () => {
        withStubs.test('Applies defaults and calls internal method', async ctx => {
            ctx.stubbedParseCwd.resolves('<resolved-cwd>');
            ctx.stubbedBarrel.barrelFiles.resolves(['<file-1>', '<file-2>']);

            await ctx.barrelCommand.handler({
                cwd: '<cwd>',
                ci: false,
                dryRun: false,
                ignore: ['<ignore>'],
            });

            expect(ctx.stubbedParseCwd.calledOnceWithExactly('<cwd>')).to.equal(true);
            expect(
                ctx.stubbedBarrel.barrelFiles.calledOnceWithExactly({
                    cwd: '<resolved-cwd>',
                    dryRun: false,
                    ignore: ['<ignore>'],
                })
            ).to.equal(true);
            expect(ctx.stubbedLogger.calledTwice).to.equal(true);
            expect(ctx.stubbedLogger.calledWith('<file-1>')).to.equal(true);
            expect(ctx.stubbedLogger.calledWith('<file-2>')).to.equal(true);
        });

        withStubs.test('Nothing logged when no changes', async ctx => {
            ctx.stubbedParseCwd.resolves('<resolved-cwd>');
            ctx.stubbedBarrel.barrelFiles.resolves([]);

            await ctx.barrelCommand.handler({
                cwd: '<cwd>',
                ci: true,
                dryRun: false,
                ignore: ['<ignore>'],
            });

            expect(ctx.stubbedLogger.notCalled).to.equal(true);
        });

        withStubs.test('Reports failure during ci', async ctx => {
            ctx.stubbedParseCwd.resolves('<resolved-cwd>');
            ctx.stubbedBarrel.barrelFiles.resolves(['<file>']);

            await expect(
                ctx.barrelCommand.handler({
                    cwd: '<cwd>',
                    ci: true,
                    dryRun: false,
                    ignore: ['<ignore>'],
                })
            ).to.eventually.be.rejectedWith(Error, 'Files are not built');

            expect(ctx.stubbedLogger.calledOnceWithExactly('<file>')).to.equal(true);
        });

        withStubs.test('Options are optional', async ctx => {
            ctx.stubbedParseCwd.resolves('<resolved-cwd>');
            ctx.stubbedBarrel.barrelFiles.resolves([]);

            await ctx.barrelCommand.handler({
                cwd: '<cwd>',
                ci: false,
                dryRun: true,
                ignore: undefined,
            });

            expect(
                ctx.stubbedBarrel.barrelFiles.calledOnceWithExactly({
                    cwd: '<resolved-cwd>',
                    dryRun: true,
                    ignore: [],
                })
            ).to.equal(true);
        });
    });
});
