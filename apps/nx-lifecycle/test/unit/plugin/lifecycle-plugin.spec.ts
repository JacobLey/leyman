import type { CreateDependenciesContext, ProjectConfiguration } from '@nx/devkit';
import type { ReadJsonFile } from '#internal/plugin/dependencies.js';
import type { LifecyclePluginOptions } from '#internal/plugin/schema.js';
import { AggregateCreateNodesError } from '@nx/devkit';
import { fake, verifyAndRestore } from 'sinon';
import { expect } from '@leyman/expect';
import { afterEach, beforeEach, suite } from 'mocha-chain';
import { stubMethod } from 'sinon-typed-stub';
import { assertProjectJson } from '#schemas';
import { LifecyclePlugin } from '#internal/plugin/lifecycle-plugin.js';
import { assertLifecyclePluginOptions } from '#internal/plugin/schema.js';

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

    const stubs = beforeEach(() => {
        const stubbedReadJsonFile = stubMethod<ReadJsonFile>();
        const fakeLogger = { warn: fake() };

        return {
            fakeLogger,
            stubbedReadJsonFile: stubbedReadJsonFile.stub,
            plugin: new LifecyclePlugin(
                assertLifecyclePluginOptions,
                stubbedReadJsonFile.method,
                assertProjectJson,
                fakeLogger
            ),
        };
    });

    afterEach(() => {
        verifyAndRestore();
    });

    suite('createNodes', () => {
        const context = {
            nxJsonConfiguration: {},
            workspaceRoot: '<root>',
        };

        stubs.test('Matches every project.json', ({ plugin }) => {
            expect(plugin.createNodes[0]).to.equal('**/project.json');
        });

        stubs.test('Infers lifecycle targets and wires declared bindings', async ctx => {
            ctx.stubbedReadJsonFile.withArgs('<root>/project.json').returns({
                targets: { tsc: {}, other: {} },
            });
            ctx.stubbedReadJsonFile.withArgs('<root>/packages/foo/project.json').returns({
                targets: { eslint: { dependsOn: ['other'] } },
            });
            ctx.stubbedReadJsonFile.withArgs('<root>/packages/bar/project.json').returns({});

            const [, createNodes] = ctx.plugin.createNodes;

            expect(
                await createNodes(
                    ['project.json', 'packages/foo/project.json', 'packages/bar/project.json'],
                    options,
                    context
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

        stubs.test('Copies object dependencies of a stage', async ctx => {
            ctx.stubbedReadJsonFile.returns({});

            const [, createNodes] = ctx.plugin.createNodes;
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
                context
            );

            expect(result?.projects?.['.']?.targets?.['e2e:_']?.dependsOn).to.deep.equal([
                { target: 'build', projects: ['server'] },
            ]);
        });

        stubs.test('Fails on invalid options', async ctx => {
            const [, createNodes] = ctx.plugin.createNodes;

            await expect(
                createNodes(
                    ['project.json'],
                    {
                        stages: { build: { hooks: 'run' } },
                        bindings: {},
                    } as unknown as LifecyclePluginOptions,
                    context
                )
            ).to.be.rejectedWith(
                Error,
                [
                    'Invalid nx-lifecycle plugin options in nx.json:',
                    '- options/stages/build/hooks must be array',
                ].join('\n')
            );
        });

        stubs.test('Fails on inconsistent stages', async ctx => {
            const [, createNodes] = ctx.plugin.createNodes;

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
                    context
                )
            ).to.be.rejectedWith(
                Error,
                'Lifecycle stage test cannot depend on build:run, which is internal to stage build. Depend on build instead'
            );
        });

        stubs.test('Fails on invalid project.json', async ctx => {
            ctx.stubbedReadJsonFile.returns({ targets: 123 });

            const [, createNodes] = ctx.plugin.createNodes;

            const thrown: unknown = await expect(
                createNodes(['project.json'], options, context)
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

        stubs.test('Accepts wired targets', ctx => {
            expect(
                ctx.plugin.createDependencies(options, contextFor({ foo: {}, bar: {} }))
            ).to.deep.equal([]);
            expect(ctx.fakeLogger.warn.callCount).to.equal(0);
        });

        stubs.test('Ignores projects without targets', ctx => {
            expect(
                ctx.plugin.createDependencies(options, {
                    projects: { foo: { root: 'foo' } },
                } as unknown as CreateDependenciesContext)
            ).to.deep.equal([]);
            expect(ctx.fakeLogger.warn.callCount).to.equal(2);
        });

        stubs.test('Warns about bindings no project defines', ctx => {
            const targets = Object.fromEntries(
                Object.entries(wiredProject.targets).filter(([targetName]) => targetName !== 'tsc')
            );

            expect(
                ctx.plugin.createDependencies(options, contextFor({ foo: { targets } }))
            ).to.deep.equal([]);
            expect(ctx.fakeLogger.warn.callCount).to.equal(1);
            expect(ctx.fakeLogger.warn.getCall(0).args).to.deep.equal([
                'Bound target tsc is not defined in any project. Is it a typo?',
            ]);
        });

        stubs.test('Fails on invalid options', ctx => {
            expect(() => ctx.plugin.createDependencies(undefined, contextFor({}))).to.throw(
                Error,
                'Invalid nx-lifecycle plugin options in nx.json'
            );
        });

        suite('Fails on unwired targets', () => {
            stubs.test('Lifecycle target overridden', ctx => {
                expect(() =>
                    ctx.plugin.createDependencies(
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

            stubs.test('Bound target in project without lifecycle targets', ctx => {
                expect(() =>
                    ctx.plugin.createDependencies(
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

            stubs.test('Bound target not declared in project.json', ctx => {
                expect(() =>
                    ctx.plugin.createDependencies(
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

            stubs.test('Bound target dependsOn replaced, once for all projects', ctx => {
                const targets = {
                    ...wiredProject.targets,
                    tsc: { executor: 'nx:run-commands', dependsOn: ['^build'] },
                    eslint: { executor: 'nx:run-commands' },
                };

                expect(() =>
                    ctx.plugin.createDependencies(
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
