import { expect } from 'chai';
import type { PopulateFile } from 'npm-populate-files';
import { verifyAndRestore } from 'sinon';
import { dedent } from 'ts-dedent';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { stubMethod } from 'sinon-typed-stub';
import { LockfileCommand } from '../../../commands/lockfile-command.js';
import type { ParseCwd } from '../../../lib/dependencies.js';
import type { GetPrunedLockfile } from '../../../lib/pruned-lockfile.js';

suite('LockfileCommand', () => {
    afterEach(() => {
        verifyAndRestore();
    });

    const withStubs = beforeEach(() => {
        const stubbedGetPrunedLockfile = stubMethod<GetPrunedLockfile>();
        const stubbedParseCwd = stubMethod<ParseCwd>();
        const stubbedPopulateFile = stubMethod<PopulateFile>();
        return {
            stubbedParseCwd: stubbedParseCwd.stub,
            stubbedGetPrunedLockfile: stubbedGetPrunedLockfile.stub,
            stubbedPopulateFile: stubbedPopulateFile.stub,
            lockfileCommand: new LockfileCommand(
                stubbedParseCwd.method,
                stubbedGetPrunedLockfile.method,
                stubbedPopulateFile.method
            ),
        };
    });

    suite('handler', () => {
        withStubs.test('Loads, hashes, and writes lockfile', async ctx => {
            ctx.stubbedParseCwd.resolves('<resolved-cwd>');
            ctx.stubbedGetPrunedLockfile.resolves({ lockfileVersion: '<version>', importers: {} });
            ctx.stubbedPopulateFile.resolves({
                updated: true,
                filePath: '<file-path>',
                reason: 'file-not-exist',
            });

            await ctx.lockfileCommand.handler({
                cwd: '<cwd>',
                ci: false,
                dryRun: false,
                lockfileName: '<lockfile-name>',
                hash: false,
                omitComment: false,
                omitLinks: false,
            });

            expect(ctx.stubbedParseCwd.calledOnceWithExactly('<cwd>')).to.equal(true);
            expect(
                ctx.stubbedGetPrunedLockfile.calledOnceWithExactly({
                    cwd: '<resolved-cwd>',
                    omitLinks: false,
                })
            ).to.equal(true);
            expect(
                ctx.stubbedPopulateFile.calledOnceWithExactly(
                    {
                        filePath: '<resolved-cwd>/<lockfile-name>',
                        content: dedent`
                            // DO NOT EDIT MANUALLY - populated by pnpm-dedicated-lockfile
                            {
                              "lockfileVersion": "<version>",
                              "importers": {}
                            }

                        `,
                    },
                    {
                        cwd: '<resolved-cwd>',
                        dryRun: false,
                        check: false,
                    }
                )
            ).to.equal(true);
        });

        withStubs.test('Optionally omit comment', async ctx => {
            ctx.stubbedParseCwd.resolves('<resolved-cwd>');
            ctx.stubbedGetPrunedLockfile.resolves({ lockfileVersion: '<version>', importers: {} });
            ctx.stubbedPopulateFile.resolves({ updated: false, filePath: '<file-path>' });

            await ctx.lockfileCommand.handler({
                cwd: '<cwd>',
                ci: false,
                dryRun: false,
                lockfileName: '<lockfile-name>',
                hash: false,
                omitComment: true,
                omitLinks: false,
            });

            expect(
                ctx.stubbedPopulateFile.calledOnceWithExactly(
                    {
                        filePath: '<resolved-cwd>/<lockfile-name>',
                        content: dedent`
                            {
                              "lockfileVersion": "<version>",
                              "importers": {}
                            }

                        `,
                    },
                    {
                        cwd: '<resolved-cwd>',
                        dryRun: false,
                        check: false,
                    }
                )
            ).to.equal(true);
        });

        withStubs.test('Optionally hash', async ctx => {
            ctx.stubbedParseCwd.resolves('<resolved-cwd>');
            ctx.stubbedGetPrunedLockfile.resolves({ lockfileVersion: '<version>', importers: {} });
            ctx.stubbedPopulateFile.resolves({ updated: false, filePath: '<file-path>' });

            await ctx.lockfileCommand.handler({
                cwd: '<cwd>',
                ci: false,
                dryRun: false,
                lockfileName: '<lockfile-name>',
                hash: true,
                omitComment: false,
                omitLinks: false,
            });

            expect(
                ctx.stubbedPopulateFile.calledOnceWithExactly(
                    {
                        filePath: '<resolved-cwd>/<lockfile-name>',
                        content: dedent`
                            // DO NOT EDIT MANUALLY - populated by pnpm-dedicated-lockfile
                            hu8ugFAiA0zcEvadNoLWR690uCSLJMVd0KLq53YL1G/QRUIh7bhGOiMvt674d4A980yWzl6qVPdaYuiAQaCluw==

                        `,
                    },
                    {
                        cwd: '<resolved-cwd>',
                        dryRun: false,
                        check: false,
                    }
                )
            ).to.equal(true);
        });

        withStubs.test('Optionally set dry-run', async ctx => {
            ctx.stubbedParseCwd.resolves('<resolved-cwd>');
            ctx.stubbedGetPrunedLockfile.resolves({ lockfileVersion: '<version>', importers: {} });
            ctx.stubbedPopulateFile.resolves({ updated: false, filePath: '<file-path>' });

            await ctx.lockfileCommand.handler({
                cwd: '<cwd>',
                ci: false,
                dryRun: true,
                lockfileName: '<lockfile-name>',
                hash: false,
                omitComment: false,
                omitLinks: false,
            });

            expect(
                ctx.stubbedPopulateFile.calledOnceWithExactly(
                    {
                        filePath: '<resolved-cwd>/<lockfile-name>',
                        content: dedent`
                            // DO NOT EDIT MANUALLY - populated by pnpm-dedicated-lockfile
                            {
                              "lockfileVersion": "<version>",
                              "importers": {}
                            }

                        `,
                    },
                    {
                        cwd: '<resolved-cwd>',
                        dryRun: true,
                        check: false,
                    }
                )
            ).to.equal(true);
        });

        withStubs.test('No error when no updates during CI', async ctx => {
            ctx.stubbedParseCwd.resolves('<resolved-cwd>');
            ctx.stubbedGetPrunedLockfile.resolves({ lockfileVersion: '<version>', importers: {} });
            ctx.stubbedPopulateFile.resolves({ updated: false, filePath: '<file-path>' });

            await ctx.lockfileCommand.handler({
                cwd: '<cwd>',
                ci: true,
                dryRun: true,
                lockfileName: '<lockfile-name>',
                hash: false,
                omitComment: false,
                omitLinks: false,
            });
        });

        withStubs.test('Throw error when updates during CI', async ctx => {
            ctx.stubbedParseCwd.resolves('<resolved-cwd>');
            ctx.stubbedGetPrunedLockfile.resolves({ lockfileVersion: '<version>', importers: {} });
            ctx.stubbedPopulateFile.resolves({
                updated: true,
                filePath: '<file-path>',
                reason: 'content-changed',
            });

            await expect(
                ctx.lockfileCommand.handler({
                    cwd: '<cwd>',
                    ci: true,
                    dryRun: true,
                    lockfileName: '<lockfile-name>',
                    hash: false,
                    omitComment: false,
                    omitLinks: true,
                })
            ).to.eventually.be.rejectedWith(Error, 'Lockfile was not up to date');

            expect(
                ctx.stubbedGetPrunedLockfile.calledOnceWithExactly({
                    cwd: '<resolved-cwd>',
                    omitLinks: true,
                })
            ).to.equal(true);
        });
    });
});
