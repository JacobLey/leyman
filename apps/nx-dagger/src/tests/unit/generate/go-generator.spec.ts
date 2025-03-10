import { readFile } from 'node:fs/promises';
import Path from 'node:path';
import { suite, test } from 'mocha-chain';
import { generateGoFile } from '../../../generate/go-generator.js';
import { expect } from '../../chai-hooks.js';

const [expectedMain, expectedBuilder] = await Promise.all([
    readFile(
        Path.join(import.meta.dirname, '../../../../src/tests/data/generated-main.go'),
        'utf8'
    ),
    readFile(
        Path.join(import.meta.dirname, '../../../../src/tests/data/generated-builder.go'),
        'utf8'
    ),
]);

suite('GenerateGoFile', () => {
    suite('generateGoFile', () => {
        test('Generates formatted go file', async () => {
            const generated = await generateGoFile({
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
                            targets: ['tsc', 'test'],
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
                            targets: ['tsc'],
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
                        'tsc',
                        {
                            name: 'tsc',
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
                            constructorArguments: ['fooArg', 'barArg'],
                            isCi: true,
                            parameters: ['projectDir', 'dependencyProjectDirectories'],
                        },
                    ],
                ]),
            });

            expect(generated.main).to.equal(expectedMain);
            expect(generated.builder).to.equal(expectedBuilder);
        });
    });
});
