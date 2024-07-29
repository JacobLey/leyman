import { suite, test } from 'mocha-chain';
import { Normalizer } from '../../../../executors/lifecycle/normalizer.js';
import { expect } from '../../../chai-hooks.js';

suite('Normalizer', () => {
    suite('normalizeOptions', () => {
        test('Use provided options', () => {
            const normalizer = new Normalizer(true);

            expect(
                normalizer.normalizeOptions(
                    {
                        check: false,
                        dryRun: true,
                        stages: {
                            myStage: {},
                        },
                        bindings: {
                            myTarget: 'myStage',
                        },
                    },
                    {
                        root: '/path/to/workspace',
                        projectsConfigurations: {
                            version: 123,
                            projects: {
                                foo: {
                                    name: 'myFoo',
                                    root: 'path/to/foo',
                                },
                                bar: {
                                    name: 'myBar',
                                    root: 'path/to/bar',
                                },
                            },
                        },
                    }
                )
            ).to.deep.equal({
                check: false,
                dryRun: true,
                nxJsonPath: '/path/to/workspace/nx.json',
                packageJsonPaths: [
                    {
                        name: 'myFoo',
                        path: '/path/to/workspace/path/to/foo/project.json',
                    },
                    {
                        name: 'myBar',
                        path: '/path/to/workspace/path/to/bar/project.json',
                    },
                ],
                stages: {
                    myStage: {},
                },
                bindings: {
                    myTarget: 'myStage',
                },
            });
        });

        test('Use defaults', () => {
            const normalizer = new Normalizer(false);

            expect(
                normalizer.normalizeOptions(
                    {},
                    {
                        root: '/path/to/workspace',
                        projectsConfigurations: {
                            version: 123,
                            projects: {
                                foo: {
                                    name: 'myFoo',
                                    root: 'path/to/foo',
                                },
                                bar: {
                                    name: 'myBar',
                                    root: 'path/to/bar',
                                },
                            },
                        },
                    }
                )
            ).to.deep.equal({
                check: false,
                dryRun: false,
                nxJsonPath: '/path/to/workspace/nx.json',
                packageJsonPaths: [
                    {
                        name: 'myFoo',
                        path: '/path/to/workspace/path/to/foo/project.json',
                    },
                    {
                        name: 'myBar',
                        path: '/path/to/workspace/path/to/bar/project.json',
                    },
                ],
                stages: {},
                bindings: {},
            });
        });
    });
});
