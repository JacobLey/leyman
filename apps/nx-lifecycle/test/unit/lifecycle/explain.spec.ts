import type { ProjectGraph, TargetConfiguration } from '@nx/devkit';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { explainLifecycle, formatExplanation } from '#internal/lifecycle/explain.js';
import { planLifecycle } from '#internal/lifecycle/processor.js';

suite('explain', () => {
    const plan = planLifecycle({
        stages: {
            test: {
                hooks: ['run', 'report'],
                dependsOn: ['build'],
            },
            prepare: {},
            build: {
                hooks: ['pre', 'run'],
                dependsOn: ['^build', 'prepare'],
            },
            verify: {
                dependsOn: ['test', { target: 'build', projects: ['server', 'client'] }],
            },
        },
        bindings: {
            codegen: 'prepare',
            tsc: 'build:run',
            swc: 'build:run',
            mocha: 'test:run',
            e2e: 'test:run',
            coverage: 'test:report',
        },
    });

    const node = (name: string, targets?: Record<string, TargetConfiguration>) => ({
        name,
        type: 'lib' as const,
        data: { root: `packages/${name}`, ...(targets ? { targets } : {}) },
    });

    // `a` -> `b` -> `c`, `a` -> `npm:foo`
    // `b` has no targets, so `a` runs the build of `c` instead
    const graph: ProjectGraph = {
        nodes: {
            a: node('a', {
                codegen: {},
                tsc: { dependsOn: ['build:pre'] },
                mocha: { dependsOn: ['test:_'] },
                e2e: {
                    dependsOn: ['test:_', 'mocha', '^tsc', { target: 'build', projects: 'server' }],
                },
            }),
            b: node('b'),
            c: node('c', { build: {} }),
        },
        dependencies: {
            a: [
                { source: 'a', target: 'b', type: 'static' },
                { source: 'a', target: 'npm:foo', type: 'static' },
            ],
            b: [{ source: 'b', target: 'c', type: 'static' }],
        },
    };

    test('Orders every stage after the stages it depends on', () => {
        const explanation = explainLifecycle({ plan, graph, project: 'a' });

        expect(explanation.project).to.equal('a');
        expect(explanation.stages.map(stage => stage.name)).to.deep.equal([
            'prepare',
            'build',
            'test',
            'verify',
        ]);
    });

    test('Only explains a stage and the stages it runs after', () => {
        const explanation = explainLifecycle({ plan, graph, project: 'a', stage: 'build' });

        expect(explanation.stages.map(stage => stage.name)).to.deep.equal(['prepare', 'build']);
    });

    test('Lists hooks with the bound targets the project declares', () => {
        const { stages } = explainLifecycle({ plan, graph, project: 'a', stage: 'test' });

        expect(stages.find(stage => stage.name === 'build')).to.deep.equal({
            name: 'build',
            dependsOn: [{ label: '^build', upstream: ['c'] }, { label: 'prepare' }],
            hooks: [
                { name: 'build:pre', targets: [] },
                { name: 'build:run', targets: [{ name: 'tsc', dependsOn: [] }] },
            ],
            hasHooks: true,
        });
        expect(stages.find(stage => stage.name === 'test')!.hooks).to.deep.equal([
            {
                name: 'test:run',
                targets: [
                    { name: 'mocha', dependsOn: [] },
                    {
                        name: 'e2e',
                        dependsOn: [
                            { label: 'mocha' },
                            { label: '^tsc', upstream: [] },
                            { label: 'server:build' },
                        ],
                    },
                ],
            },
            { name: 'test:report', targets: [] },
        ]);
    });

    test('Lists targets bound to a stage without hooks under the stage', () => {
        const { stages } = explainLifecycle({ plan, graph, project: 'a', stage: 'prepare' });

        expect(stages).to.deep.equal([
            {
                name: 'prepare',
                dependsOn: [],
                hooks: [{ name: 'prepare', targets: [{ name: 'codegen', dependsOn: [] }] }],
                hasHooks: false,
            },
        ]);
    });

    test('Lists no bound targets for a project without targets', () => {
        const { stages } = explainLifecycle({ plan, graph, project: 'b', stage: 'prepare' });

        expect(stages).to.deep.equal([
            {
                name: 'prepare',
                dependsOn: [],
                hooks: [{ name: 'prepare', targets: [] }],
                hasHooks: false,
            },
        ]);
    });

    test('Fails on an unknown project', () => {
        expect(() => explainLifecycle({ plan, graph, project: 'unknown' })).to.throw(
            'Project unknown not found'
        );
    });

    test('Fails on an unknown stage', () => {
        expect(() => explainLifecycle({ plan, graph, project: 'a', stage: 'build:run' })).to.throw(
            'Stage build:run not found. Stages: test, prepare, build, verify'
        );
    });

    test('Formats an outline', () => {
        expect(formatExplanation(explainLifecycle({ plan, graph, project: 'a' }))).to.equal(
            [
                'a',
                '',
                '1. prepare',
                '   codegen',
                '',
                '2. build',
                '   after: ^build (c); prepare',
                '   build:pre (nothing bound)',
                '   build:run',
                '     tsc',
                '',
                '3. test',
                '   after: build',
                '   test:run',
                '     mocha',
                '     e2e (also after: mocha; ^tsc (no upstream projects); server:build)',
                '   test:report (nothing bound)',
                '',
                '4. verify',
                '   after: test; server:build, client:build',
            ].join('\n')
        );
    });
});
