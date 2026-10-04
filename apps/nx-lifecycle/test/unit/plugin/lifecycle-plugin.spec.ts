import type { CreateDependenciesContext, ProjectConfiguration } from '@nx/devkit';
import type { LifecyclePluginOptions } from 'nx-lifecycle/plugin';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import Os from 'node:os';
import Path from 'node:path';
import { AggregateCreateNodesError, logger } from '@nx/devkit';
import { stub, verifyAndRestore } from 'sinon';
import { expect } from '@leyman/expect';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { createDependencies, createNodes as createNodesTuple } from 'nx-lifecycle/plugin';

const [, createNodes] = createNodesTuple;

suite('LifecyclePlugin', () => {
    const options = {
        stages: {
            build: {
                hooks: ['run'],
                dependsOn: ['^build'],
            },
            lint: {},
        },
        bindings: {
            tsc: 'build:run',
            eslint: 'lint',
        },
    } satisfies LifecyclePluginOptions;

    const withWorkspace = beforeEach(async () => {
        const workspaceRoot = await mkdtemp(Path.join(Os.tmpdir(), 'nx-lifecycle-plugin-'));

        return {
            workspaceRoot,
            context: { nxJsonConfiguration: {}, workspaceRoot },
            writeProjectJson: async (path: string, data: unknown): Promise<void> => {
                await mkdir(Path.dirname(Path.join(workspaceRoot, path)), { recursive: true });
                await writeFile(Path.join(workspaceRoot, path), JSON.stringify(data));
            },
            // Warnings are printed with the Nx logger
            warn: stub(logger, 'warn'),
        };
    });

    withWorkspace.afterEach(async ({ workspaceRoot }) => {
        await rm(workspaceRoot, { recursive: true, force: true });
    });

    afterEach(() => {
        verifyAndRestore();
    });

    suite('createNodes', () => {
        withWorkspace.test('Infers lifecycle targets and wires declared bindings', async ctx => {
            await Promise.all([
                ctx.writeProjectJson('project.json', { targets: { tsc: {}, other: {} } }),
                ctx.writeProjectJson('packages/foo/project.json', {
                    targets: { eslint: { dependsOn: ['other'] } },
                }),
                ctx.writeProjectJson('packages/bar/project.json', {}),
            ]);

            expect(
                await createNodes(
                    ['project.json', 'packages/foo/project.json', 'packages/bar/project.json'],
                    options,
                    ctx.context
                )
            ).to.deep.equal([
                [
                    'project.json',
                    {
                        projects: {
                            '.': {
                                targets: {
                                    'build:_': {
                                        executor: 'nx:noop',
                                        dependsOn: ['^build'],
                                        metadata: {
                                            description:
                                                'Start of the build stage. Waits for the dependencies of the stage',
                                        },
                                    },
                                    'build:run': {
                                        executor: 'nx:noop',
                                        dependsOn: ['build:_', 'tsc'],
                                        metadata: {
                                            description: 'Runs the targets bound to build:run',
                                        },
                                    },
                                    build: {
                                        executor: 'nx:noop',
                                        dependsOn: ['build:run'],
                                        metadata: { description: 'Runs the build stage' },
                                    },
                                    'lint:_': {
                                        executor: 'nx:noop',
                                        dependsOn: [],
                                        metadata: {
                                            description:
                                                'Start of the lint stage. Waits for the dependencies of the stage',
                                        },
                                    },
                                    lint: {
                                        executor: 'nx:noop',
                                        dependsOn: ['lint:_'],
                                        metadata: { description: 'Runs the lint stage' },
                                    },
                                    tsc: {
                                        dependsOn: ['build:_'],
                                    },
                                },
                            },
                        },
                    },
                ],
                [
                    'packages/foo/project.json',
                    {
                        projects: {
                            'packages/foo': {
                                targets: {
                                    'build:_': {
                                        executor: 'nx:noop',
                                        dependsOn: ['^build'],
                                        metadata: {
                                            description:
                                                'Start of the build stage. Waits for the dependencies of the stage',
                                        },
                                    },
                                    'build:run': {
                                        executor: 'nx:noop',
                                        dependsOn: ['build:_'],
                                        metadata: {
                                            description: 'Runs the targets bound to build:run',
                                        },
                                    },
                                    build: {
                                        executor: 'nx:noop',
                                        dependsOn: ['build:run'],
                                        metadata: { description: 'Runs the build stage' },
                                    },
                                    'lint:_': {
                                        executor: 'nx:noop',
                                        dependsOn: [],
                                        metadata: {
                                            description:
                                                'Start of the lint stage. Waits for the dependencies of the stage',
                                        },
                                    },
                                    lint: {
                                        executor: 'nx:noop',
                                        dependsOn: ['lint:_', 'eslint'],
                                        metadata: { description: 'Runs the lint stage' },
                                    },
                                    eslint: {
                                        dependsOn: ['lint:_'],
                                    },
                                },
                            },
                        },
                    },
                ],
                [
                    'packages/bar/project.json',
                    {
                        projects: {
                            'packages/bar': {
                                targets: {
                                    'build:_': {
                                        executor: 'nx:noop',
                                        dependsOn: ['^build'],
                                        metadata: {
                                            description:
                                                'Start of the build stage. Waits for the dependencies of the stage',
                                        },
                                    },
                                    'build:run': {
                                        executor: 'nx:noop',
                                        dependsOn: ['build:_'],
                                        metadata: {
                                            description: 'Runs the targets bound to build:run',
                                        },
                                    },
                                    build: {
                                        executor: 'nx:noop',
                                        dependsOn: ['build:run'],
                                        metadata: { description: 'Runs the build stage' },
                                    },
                                    'lint:_': {
                                        executor: 'nx:noop',
                                        dependsOn: [],
                                        metadata: {
                                            description:
                                                'Start of the lint stage. Waits for the dependencies of the stage',
                                        },
                                    },
                                    lint: {
                                        executor: 'nx:noop',
                                        dependsOn: ['lint:_'],
                                        metadata: { description: 'Runs the lint stage' },
                                    },
                                },
                            },
                        },
                    },
                ],
            ]);
        });

        withWorkspace.test('Copies object dependencies of a stage', async ctx => {
            await ctx.writeProjectJson('project.json', {});

            const [[, result] = []] = await createNodes(
                ['project.json'],
                {
                    stages: {
                        e2e: {
                            dependsOn: [{ target: 'build', projects: ['server'] }],
                        },
                    },
                    bindings: {},
                },
                ctx.context
            );

            expect(result?.projects?.['.']?.targets?.['e2e:_']?.dependsOn).to.deep.equal([
                { target: 'build', projects: ['server'] },
            ]);
        });

        withWorkspace.test('Fails on invalid options', async ctx => {
            await expect(
                createNodes(
                    ['project.json'],
                    {
                        stages: { build: { hooks: 'run' } },
                        bindings: {},
                    } as unknown as LifecyclePluginOptions,
                    ctx.context
                )
            ).to.be.rejectedWith(
                Error,
                [
                    'Invalid nx-lifecycle plugin options in nx.json:',
                    '- options/stages/build/hooks must be array',
                ].join('\n')
            );
        });

        withWorkspace.test('Fails on inconsistent stages', async ctx => {
            await expect(
                createNodes(
                    ['project.json'],
                    {
                        stages: {
                            build: { hooks: ['run'] },
                            test: { dependsOn: ['build:run'] },
                        },
                        bindings: {},
                    },
                    ctx.context
                )
            ).to.be.rejectedWith(
                Error,
                'Lifecycle stage test cannot depend on build:run, which is internal to stage build. Depend on build instead'
            );
        });

        withWorkspace.test('Fails on invalid project.json', async ctx => {
            await ctx.writeProjectJson('project.json', { targets: 123 });

            const thrown: unknown = await expect(
                createNodes(['project.json'], options, ctx.context)
            ).to.be.rejectedWith(AggregateCreateNodesError);
            expect(thrown)
                .to.have.property('errors')
                .that.has.deep.nested.property('[0][0]', 'project.json');
        });
    });

    suite('createDependencies', () => {
        const wiredProject = {
            root: 'packages/foo',
            targets: {
                'build:_': {
                    executor: 'nx:noop',
                    dependsOn: [{ target: 'build', dependencies: true }],
                },
                'build:run': { executor: 'nx:noop', dependsOn: ['build:_', { target: 'tsc' }] },
                build: { executor: 'nx:noop', dependsOn: ['build:run'] },
                'lint:_': { executor: 'nx:noop' },
                lint: { executor: 'nx:noop', dependsOn: ['lint:_', 'eslint'] },
                tsc: { executor: 'nx:run-commands', dependsOn: [{ target: 'build:_' }] },
                eslint: { executor: 'nx:run-commands', dependsOn: ['other', 'lint:_'] },
                other: {},
            },
        } satisfies ProjectConfiguration;

        const contextFor = (
            projects: Record<string, Partial<ProjectConfiguration>>
        ): CreateDependenciesContext =>
            ({
                projects: Object.fromEntries(
                    Object.entries(projects).map(([name, project]) => [
                        name,
                        { ...wiredProject, ...project, name },
                    ])
                ),
            }) as unknown as CreateDependenciesContext;

        withWorkspace.test('Accepts wired targets', ctx => {
            expect(createDependencies(options, contextFor({ foo: {}, bar: {} }))).to.deep.equal([]);
            expect(ctx.warn.callCount).to.equal(0);
        });

        withWorkspace.test('Ignores projects without targets', ctx => {
            expect(
                createDependencies(options, {
                    projects: { foo: { root: 'foo' } },
                } as unknown as CreateDependenciesContext)
            ).to.deep.equal([]);
            // Neither bound target is defined, as the only project has no targets
            expect(ctx.warn.args).to.deep.equal([
                ['Bound target tsc is not defined in any project. Is it a typo?'],
                ['Bound target eslint is not defined in any project. Is it a typo?'],
            ]);
        });

        withWorkspace.test('Warns about bindings no project defines', ctx => {
            const targets = Object.fromEntries(
                Object.entries(wiredProject.targets).filter(([targetName]) => targetName !== 'tsc')
            );

            expect(createDependencies(options, contextFor({ foo: { targets } }))).to.deep.equal([]);
            expect(ctx.warn.callCount).to.equal(1);
            expect(ctx.warn.getCall(0).args).to.deep.equal([
                'Bound target tsc is not defined in any project. Is it a typo?',
            ]);
        });

        withWorkspace.test('Fails on invalid options', () => {
            expect(() => createDependencies(undefined, contextFor({}))).to.throw(
                Error,
                'Invalid nx-lifecycle plugin options in nx.json'
            );
        });

        suite('Fails on unwired targets', () => {
            withWorkspace.test('Lifecycle target overridden', () => {
                expect(() =>
                    createDependencies(
                        options,
                        contextFor({
                            foo: {
                                targets: {
                                    ...wiredProject.targets,
                                    'build:_': { executor: 'nx:noop', dependsOn: [] },
                                    lint: { executor: 'nx:run-commands', dependsOn: ['lint:_'] },
                                },
                            },
                        })
                    )
                ).to.throw(
                    Error,
                    [
                        'nx-lifecycle targets are not wired as configured:',
                        '- build:_ is inferred by nx-lifecycle, but project.json or nx.json targetDefaults override it. Remove it from there',
                        '  Projects: foo',
                        '- lint is inferred by nx-lifecycle, but project.json or nx.json targetDefaults override it. Remove it from there',
                        '  Projects: foo',
                    ].join('\n')
                );
            });

            withWorkspace.test('Bound target in project without lifecycle targets', () => {
                expect(() =>
                    createDependencies(
                        options,
                        contextFor({
                            foo: {},
                            bar: { targets: { tsc: {} } },
                        })
                    )
                ).to.throw(
                    Error,
                    [
                        'nx-lifecycle targets are not wired as configured:',
                        '- tsc is bound to build:run, but nx-lifecycle only adds lifecycle targets to projects with a project.json. Add one',
                        '  Projects: bar',
                    ].join('\n')
                );
            });

            withWorkspace.test('Bound target not declared in project.json', () => {
                expect(() =>
                    createDependencies(
                        options,
                        contextFor({
                            foo: {
                                targets: {
                                    ...wiredProject.targets,
                                    'build:run': { executor: 'nx:noop', dependsOn: ['build:_'] },
                                },
                            },
                        })
                    )
                ).to.throw(
                    Error,
                    [
                        'nx-lifecycle targets are not wired as configured:',
                        '- tsc is bound to build:run, but is not declared in project.json. Declare it there so nx-lifecycle can wire it',
                        '  Projects: foo',
                    ].join('\n')
                );
            });

            withWorkspace.test('Bound target dependsOn replaced, once for all projects', () => {
                const targets = {
                    ...wiredProject.targets,
                    tsc: { executor: 'nx:run-commands', dependsOn: ['^build'] },
                    eslint: { executor: 'nx:run-commands' },
                };

                expect(() =>
                    createDependencies(
                        options,
                        contextFor({ foo: { targets }, bar: { targets }, baz: {} })
                    )
                ).to.throw(
                    Error,
                    [
                        'nx-lifecycle targets are not wired as configured:',
                        '- tsc is bound to build:run, so it must depend on build:_. A dependsOn in project.json or nx.json targetDefaults replaces the inferred one, so add "build:_" to it',
                        '  Projects: foo, bar',
                        '- eslint is bound to lint, so it must depend on lint:_. A dependsOn in project.json or nx.json targetDefaults replaces the inferred one, so add "lint:_" to it',
                        '  Projects: foo, bar',
                    ].join('\n')
                );
            });
        });
    });
});
