import { readFile } from 'node:fs/promises';
import Path from 'node:path';
import { suite, test } from 'mocha-chain';
import { generateGoFile } from '../../../generate/go-generator.js';
import { expect } from '../../chai-hooks.js';

suite('GenerateGoFile', () => {
    suite('generateGoFile', () => {
        test('Generates formatted go file', async () => {
            const [generated, expected] = await Promise.all([
                generateGoFile({
                    constructorArguments: new Map([
                        [
                            'fooArg',
                            {
                                name: 'fooArg',
                                type: 'string',
                            },
                        ],
                        [
                            'barArg',
                            {
                                name: 'barArg',
                                type: 'int',
                            },
                        ],
                    ]),
                    dagger: {
                        directory: 'dagger/directory',
                        name: 'monorepo-fn',
                    },
                    gitIgnore: ['ignore', 'stuff/**', '!allowed'],
                    runtimes: new Map([
                        [
                            'node',
                            {
                                name: 'node',
                                preBuild: {
                                    name: 'node-install',
                                    constructorArguments: ['fooArg'],
                                    parameters: [],
                                },
                                postBuild: {
                                    name: 'NodeDeploy',
                                    constructorArguments: ['barArg'],
                                    parameters: ['source', 'output'],
                                },
                            },
                        ],
                    ]),
                    projects: new Map([
                        [
                            'a',
                            {
                                name: 'a',
                                directory: 'path/to/a',
                                runtime: 'node',
                                targets: ['build', 'test'],
                                dependencies: [],
                                directDependencies: [],
                            },
                        ],
                        [
                            'b',
                            {
                                name: 'b',
                                directory: 'path/to/b',
                                runtime: 'node',
                                targets: ['build'],
                                dependencies: ['a'],
                                directDependencies: ['a'],
                            },
                        ],
                        [
                            'c',
                            {
                                name: 'c',
                                directory: 'path/to/c',
                                runtime: 'node',
                                targets: ['test'],
                                dependencies: ['a', 'b'],
                                directDependencies: ['b'],
                            },
                        ],
                    ]),
                    targets: new Map([
                        [
                            'build',
                            {
                                name: 'build',
                                methodName: 'tsc',
                                constructorArguments: ['fooArg'],
                                isCi: false,
                                parameters: [
                                    'projectSource',
                                    'projectOutput',
                                    'directDependencyProjectDirectories',
                                ],
                            },
                        ],
                        [
                            'test',
                            {
                                name: 'test',
                                methodName: 'test',
                                constructorArguments: ['fooArg', 'barArg'],
                                isCi: true,
                                parameters: ['projectDir', 'dependencyProjectDirectories'],
                            },
                        ],
                    ]),
                }),
                readFile(
                    Path.join(import.meta.dirname, '../../../../src/tests/data/generated.go'),
                    'utf8'
                ),
            ]);

            expect(generated).to.equal(expected);
        });
    });
});
