import type { readFile as ReadFile } from 'node:fs/promises';
import type { TextFormatter } from 'npm-format-file';
import type { PopulateFile } from 'npm-populate-files';
import { verifyAndRestore } from 'sinon';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { stubMethod } from 'sinon-typed-stub';
import { UpdateTsReferencesFactory } from '../../../lib/update-ts-references.js';
import { expect } from '../../chai-hooks.js';

suite('UpdateTsReferencesFactory', () => {
    afterEach(() => {
        verifyAndRestore();
    });

    const withStubs = beforeEach(() => {
        const stubbedReadFile = stubMethod<typeof ReadFile>();
        const stubbedTextFormatter = stubMethod<TextFormatter>();
        const stubbedPopulateFile = stubMethod<PopulateFile>();
        return {
            stubbedReadFile: stubbedReadFile.stub,
            stubbedTextFormatter: stubbedTextFormatter.stub,
            stubbedPopulateFile: stubbedPopulateFile.stub,
            updateTsReferences: new UpdateTsReferencesFactory(
                stubbedReadFile.method,
                stubbedTextFormatter.method,
                stubbedPopulateFile.method
            ).updateTsReferences,
        };
    });

    suite('updateTsReferences', () => {
        withStubs.test('success', async ctx => {
            ctx.stubbedReadFile.withArgs('/path/to/ts/config/tsconfig.json', 'utf8').resolves(
                JSON.stringify(
                    {
                        extends: '../../tsconfig.build.json',
                        compilerOptions: {
                            outDir: 'dist',
                            rootDir: 'src',
                            tsBuildInfoFile: 'dist/tsconfig.tsbuildinfo',
                        },
                    },
                    null,
                    4
                )
            );
            ctx.stubbedReadFile.withArgs('/path/to/depdendency-1/tsconfig.json', 'utf8').resolves(
                JSON.stringify({
                    references: [],
                })
            );
            ctx.stubbedReadFile.withArgs('/path/to/depdendency-2/tsconfig.json', 'utf8').resolves(
                JSON.stringify({
                    compilerOptions: {},
                })
            );

            ctx.stubbedTextFormatter.resolves('<formatted>');

            ctx.stubbedPopulateFile
                .withArgs(
                    {
                        filePath: '/path/to/ts/config/tsconfig.json',
                        content: '<formatted>',
                    },
                    {
                        dryRun: false,
                        check: false,
                    }
                )
                .resolves({ updated: true, filePath: '<file-path>', reason: 'content-changed' });

            expect(
                await ctx.updateTsReferences({
                    tsConfigPath: '/path/to/ts/config/tsconfig.json',
                    dependencyRootPaths: [
                        '/path/to/depdendency-1/tsconfig.json',
                        '/path/to/depdendency-2/tsconfig.json',
                    ],
                    dryRun: false,
                })
            ).to.equal(true);

            expect(ctx.stubbedReadFile.callCount).to.equal(3);
            expect(ctx.stubbedTextFormatter.callCount).to.equal(1);
            expect(ctx.stubbedPopulateFile.callCount).to.equal(1);

            expect(ctx.stubbedTextFormatter.getCall(0).args).to.deep.equal([
                JSON.stringify(
                    {
                        extends: '../../tsconfig.build.json',
                        compilerOptions: {
                            outDir: 'dist',
                            rootDir: 'src',
                            tsBuildInfoFile: 'dist/tsconfig.tsbuildinfo',
                        },
                        references: [
                            { path: '../../depdendency-1' },
                            { path: '../../depdendency-2' },
                        ],
                    },
                    null,
                    2
                ),
                {
                    ext: '.json',
                },
            ]);
        });

        withStubs.test('Support custom config names', async ctx => {
            ctx.stubbedReadFile
                .withArgs('/path/to/ts/config/tsconfig.other.json', 'utf8')
                .resolves(JSON.stringify({}));
            ctx.stubbedReadFile
                .withArgs('/path/to/depdendency-1/tsconfig.other.json', 'utf8')
                .resolves(
                    JSON.stringify({
                        references: [],
                    })
                );

            ctx.stubbedTextFormatter.resolves('<formatted>');

            ctx.stubbedPopulateFile.resolves({ updated: false, filePath: '<file-path>' });

            expect(
                await ctx.updateTsReferences({
                    tsConfigPath: '/path/to/ts/config/tsconfig.other.json',
                    dependencyRootPaths: ['/path/to/depdendency-1/tsconfig.other.json'],
                    dryRun: false,
                })
            ).to.equal(false);

            expect(ctx.stubbedTextFormatter.getCall(0).args).to.deep.equal([
                JSON.stringify(
                    {
                        references: [{ path: '../../depdendency-1/tsconfig.other.json' }],
                    },
                    null,
                    2
                ),
                {
                    ext: '.json',
                },
            ]);
        });

        withStubs.test('Ignore non-existent configs', async ctx => {
            ctx.stubbedReadFile
                .withArgs('/path/to/ts/config/tsconfig.json', 'utf8')
                .resolves(JSON.stringify({}));
            ctx.stubbedReadFile.withArgs('/path/to/depdendency-1/tsconfig.json', 'utf8').resolves(
                JSON.stringify({
                    references: [],
                })
            );
            ctx.stubbedReadFile
                .withArgs('/path/to/depdendency-2/tsconfig.json', 'utf8')
                .rejects(new Error('<ERROR>'));
            ctx.stubbedReadFile
                .withArgs('/path/to/depdendency-3/tsconfig.json', 'utf8')
                .resolves(JSON.stringify({ references: '<ERROR>' }));

            ctx.stubbedTextFormatter.resolves('<formatted>');

            ctx.stubbedPopulateFile.resolves({
                updated: true,
                filePath: '<file-path>',
                reason: 'content-changed',
            });

            expect(
                await ctx.updateTsReferences({
                    tsConfigPath: '/path/to/ts/config/tsconfig.json',
                    dependencyRootPaths: [
                        '/path/to/depdendency-1/tsconfig.json',
                        '/path/to/depdendency-2/tsconfig.json',
                        '/path/to/depdendency-3/tsconfig.json',
                    ],
                    dryRun: false,
                })
            ).to.equal(true);

            expect(ctx.stubbedReadFile.callCount).to.equal(4);

            expect(ctx.stubbedTextFormatter.getCall(0).args).to.deep.equal([
                JSON.stringify(
                    {
                        references: [{ path: '../../depdendency-1' }],
                    },
                    null,
                    2
                ),
                {
                    ext: '.json',
                },
            ]);
        });
    });
});
