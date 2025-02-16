import Path from 'node:path';
import { createProjectGraphAsync, type ExecutorContext } from '@nx/devkit';
import type { Context } from 'mocha';
import { defaultImport } from 'default-import';
import { before, suite } from 'mocha-chain';
import executor from '../../executors/update-ts-references/index.cjs';
import { expect } from '../chai-hooks.js';

const handler = defaultImport(executor);

suite('plugin', () => {
    const withExecutorContext = before(async function (this: Context) {
        this.timeout(2000);
        const projectGraph = await createProjectGraphAsync();
        return {
            projectGraph,
            defaultSettings: {
                projectName: 'nx-update-ts-references',
                root: Path.join(import.meta.dirname, '../../../../..'),
                nxJsonConfiguration: {},
                projectsConfigurations: {
                    version: 123,
                    projects: {},
                },
                cwd: process.cwd(),
                isVerbose: false,
                projectGraph,
            } satisfies ExecutorContext,
        };
    });

    withExecutorContext.test('success', async ({ defaultSettings }) => {
        expect(
            await handler(
                {
                    check: true,
                    dryRun: true,
                },
                defaultSettings
            )
        ).to.deep.equal({ success: true });
    });

    suite('Out of sync', () => {
        const withInvalidContext = withExecutorContext.before(
            ({ defaultSettings, projectGraph }) => ({
                errorSettings: {
                    ...defaultSettings,
                    projectGraph: {
                        ...projectGraph,
                        dependencies: {
                            ...projectGraph.dependencies,
                            'nx-update-ts-references': [],
                        },
                    },
                },
            })
        );

        withInvalidContext.test('Fails when check is enabled', async ({ errorSettings }) => {
            expect(
                await handler(
                    {
                        check: true,
                        dryRun: false,
                    },
                    errorSettings
                )
            ).to.deep.equal({ success: false });
        });

        withInvalidContext.test('Passes when dryRun is enabled', async ({ errorSettings }) => {
            expect(
                await handler(
                    {
                        check: false,
                        dryRun: true,
                    },
                    errorSettings
                )
            ).to.deep.equal({ success: true });
        });
    });
});
