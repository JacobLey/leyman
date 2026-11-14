import { rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
    checkPackage,
    CheckPackageError,
    CheckPackageRootError,
    CheckPackageTscError,
    defaultNotPublished,
} from '@leyman/check-package';
import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';
import { createWorkspace, goodPackage, tsc } from './lib/fixtures.js';

suite('checkPackage', () => {
    const withWorkspace = beforeEach(createWorkspace);
    withWorkspace.afterEach(async ({ tmpDir }) => {
        await tmpDir.cleanup();
    });

    withWorkspace.test('Finds no problems in a good package', async ({ cwd, writeFiles }) => {
        await writeFiles(goodPackage());

        expect(await checkPackage({ profile: 'esm-only', cwd, tsc })).to.deep.equal({
            problems: [],
            suggestions: [],
            filesOnly: false,
        });
    });

    withWorkspace.test('Takes the package and tsc as URLs', async ({ cwd, writeFiles }) => {
        await writeFiles(goodPackage());

        const { problems } = await checkPackage({
            cwd: pathToFileURL(cwd),
            profile: 'esm-only',
            tsc: pathToFileURL(tsc),
        });

        expect(problems).to.deep.equal([]);
    });

    withWorkspace.test('Checks CommonJS resolution by default', async ({ cwd, writeFiles }) => {
        await writeFiles(goodPackage());

        const { problems } = await checkPackage({ cwd, tsc });

        expect(problems.some(problem => problem.includes('(node16-cjs)'))).to.equal(true);
    });

    withWorkspace.test(
        'Reports a problem in a file, outside any entry point',
        async ({ cwd, writeFiles }) => {
            await writeFiles({
                ...goodPackage({ imports: { '#answer': './dist/answer.js' } }),
                'pkg/dist/index.d.ts': "export { answer } from '#answer';\n",
                'pkg/dist/answer.js': 'export const answer = 42;\n',
                'pkg/dist/answer.d.ts': 'export declare const answer: number;\n',
            });

            const { problems } = await checkPackage({ cwd, tsc });

            expect(problems.some(problem => problem.startsWith('attw (node10):'))).to.equal(true);
        }
    );

    withWorkspace.test('Reports a package without types', async ({ cwd, writeFiles }) => {
        await writeFiles(
            Object.fromEntries(
                Object.entries(goodPackage({ types: undefined })).filter(
                    ([path]) => path !== 'pkg/dist/index.d.ts'
                )
            )
        );

        const { problems } = await checkPackage({ cwd, profile: 'esm-only' });

        expect(problems).to.include('attw: the package has no types');
    });

    withWorkspace.test(
        'Reports publint errors, and its suggestions apart',
        async ({ cwd, writeFiles }) => {
            await writeFiles(
                goodPackage({ exports: { '.': './dist/missing.js' }, type: undefined })
            );

            const { problems, suggestions } = await checkPackage({ profile: 'esm-only', cwd, tsc });

            expect(problems.some(problem => /^publint error \w+:/v.test(problem))).to.equal(true);
            expect(
                suggestions.some(suggestion => /^publint suggestion \w+:/v.test(suggestion))
            ).to.equal(true);
        }
    );

    suite('Published files', () => {
        withWorkspace.test(
            'Reports a top-level path that is not published',
            async ({ cwd, writeFiles }) => {
                await writeFiles({ ...goodPackage(), 'pkg/data/a.json': '{}' });

                const { problems } = await checkPackage({ profile: 'esm-only', cwd, tsc });

                expect(problems).to.deep.equal([
                    'files: "data" is not published. Add it to "files" in package.json, or if it should never be published, to the paths not published (--not-published).',
                ]);
            }
        );

        withWorkspace.test('Reports paths in code-unit order', async ({ cwd, writeFiles }) => {
            await writeFiles({ ...goodPackage(), 'pkg/Zeta.txt': '', 'pkg/alpha.txt': '' });

            const { problems } = await checkPackage({ profile: 'esm-only', cwd, tsc });

            expect(problems).to.deep.equal(
                ['Zeta.txt', 'alpha.txt'].map(
                    name =>
                        `files: "${name}" is not published. Add it to "files" in package.json, or if it should never be published, to the paths not published (--not-published).`
                )
            );
        });

        withWorkspace.test(
            'Accepts a path known not to be published',
            async ({ cwd, writeFiles }) => {
                await writeFiles({
                    ...goodPackage(),
                    'pkg/data/a.json': '{}',
                    'pkg/src/index.ts': '',
                });

                const { problems } = await checkPackage({
                    notPublished: ['data'],
                    profile: 'esm-only',
                    cwd,
                    tsc,
                });

                expect(problems).to.deep.equal([]);
            }
        );

        withWorkspace.test(
            'Reports a path known not to be published that is',
            async ({ cwd, writeFiles }) => {
                await writeFiles({
                    ...goodPackage({ files: ['dist', 'src'] }),
                    'pkg/src/index.ts': '',
                });

                const { problems } = await checkPackage({ profile: 'esm-only', cwd, tsc });

                expect(problems).to.deep.equal([
                    'files: "src" is published, but should never be. Remove it from "files" in package.json.',
                ]);
            }
        );

        withWorkspace.test(
            'Skips paths ignored by the root and the package .gitignore',
            async ({ cwd, writeFiles }) => {
                await writeFiles({
                    ...goodPackage(),
                    '.gitignore': 'coverage/\n',
                    'pkg/.gitignore': 'out\n',
                    'pkg/coverage/lcov.info': '',
                    'pkg/out/a.txt': '',
                });

                const { problems } = await checkPackage({ profile: 'esm-only', cwd, tsc });

                expect(problems).to.deep.equal([]);
            }
        );

        withWorkspace.test(
            'Reports a path the package .gitignore re-includes',
            async ({ cwd, writeFiles }) => {
                await writeFiles({
                    ...goodPackage(),
                    '.gitignore': '*.txt\n',
                    'pkg/.gitignore': '!keep.txt\n',
                    'pkg/keep.txt': '',
                    'pkg/skip.txt': '',
                });

                const { problems } = await checkPackage({ profile: 'esm-only', cwd, tsc });

                expect(problems).to.deep.equal([
                    'files: "keep.txt" is not published. Add it to "files" in package.json, or if it should never be published, to the paths not published (--not-published).',
                ]);
            }
        );

        withWorkspace.test(
            'Skips .git, for a package that is its own repository',
            async ({ cwd, writeFiles }) => {
                await writeFiles({ ...goodPackage(), 'pkg/.git/HEAD': 'ref: refs/heads/main\n' });

                const { problems } = await checkPackage({ profile: 'esm-only', cwd, tsc });

                expect(problems).to.deep.equal([]);
            }
        );

        withWorkspace.test('Lists what is never published by default', () => {
            expect(defaultNotPublished).to.include.members(['src', 'test', 'tsconfig.json']);
        });
    });

    suite('Files only', () => {
        const configsPackage = (
            overrides: Record<string, unknown> = {}
        ): Record<string, string> => ({
            'pkg/package.json': JSON.stringify({
                name: 'configs-package',
                version: '1.0.0',
                type: 'module',
                license: 'MIT',
                files: ['tsconfig.base.json'],
                ...overrides,
            }),
            'pkg/tsconfig.base.json': '{}',
        });

        withWorkspace.test(
            'Checks a package without entry points as files only',
            async ({ cwd, writeFiles }) => {
                await writeFiles({
                    ...configsPackage(),
                    'node_modules/@types/node/package.json': JSON.stringify({
                        name: '@types/node',
                        version: '24.1.0',
                    }),
                });

                expect(await checkPackage({ cwd })).to.deep.equal({
                    problems: [],
                    suggestions: [],
                    filesOnly: true,
                });
            }
        );

        withWorkspace.test(
            'Still checks the published files of a files-only package',
            async ({ cwd, writeFiles }) => {
                await writeFiles({ ...configsPackage(), 'pkg/data/a.json': '{}' });

                const { problems } = await checkPackage({ cwd });

                expect(problems).to.have.length(1);
                expect(problems[0]).to.match(/^files: "data" is not published\./v);
            }
        );

        withWorkspace.test(
            "Still checks a files-only package's dependencies against the floor it names",
            async ({ cwd, writeFiles }) => {
                await writeFiles({
                    ...configsPackage({
                        engines: { node: '>=22' },
                        dependencies: { newer: '^1' },
                    }),
                    'node_modules/newer/package.json': JSON.stringify({
                        engines: { node: '>=24' },
                    }),
                });

                const { problems } = await checkPackage({ cwd });

                expect(problems).to.deep.equal([
                    `engines.node: ">=22" allows Node.js 22.0.0, which newer doesn't support (">=24"). Raise the floor to match.`,
                ]);
            }
        );

        withWorkspace.test(
            'Treats a published index.js as an entry point',
            async ({ cwd, writeFiles }) => {
                await writeFiles({
                    ...configsPackage({ files: ['index.js'] }),
                    'pkg/index.js': 'export {};\n',
                });

                const { filesOnly, problems } = await checkPackage({ cwd, tsc });

                expect(filesOnly).to.equal(false);
                expect(problems).to.include(
                    'engines.node: missing. Add ">=<version>", the oldest Node.js the package supports.'
                );
            }
        );

        for (const field of ['bin', 'exports', 'main', 'module', 'types', 'typings']) {
            withWorkspace.test(`Treats ${field} as an entry point`, async ({ cwd, writeFiles }) => {
                await writeFiles(configsPackage({ [field]: './tsconfig.base.json' }));

                const { filesOnly } = await checkPackage({ cwd, tsc });

                expect(filesOnly).to.equal(false);
            });
        }
    });

    suite('Support floor', () => {
        withWorkspace.test('Reports engines.node without a floor', async ({ cwd, writeFiles }) => {
            await writeFiles(goodPackage({ engines: { node: '^22' } }));

            const { problems } = await checkPackage({ profile: 'esm-only', cwd, tsc });

            expect(problems).to.deep.equal([
                'engines.node: "^22" names no floor. Use ">=<version>".',
            ]);
        });

        withWorkspace.test('Reports a missing engines.node', async ({ cwd, writeFiles }) => {
            await writeFiles(goodPackage({ engines: undefined }));

            const { problems } = await checkPackage({ profile: 'esm-only', cwd, tsc });

            expect(problems).to.deep.equal([
                'engines.node: missing. Add ">=<version>", the oldest Node.js the package supports.',
            ]);
        });

        withWorkspace.test(
            "Reports a dependency that doesn't support the floor",
            async ({ cwd, writeFiles }) => {
                await writeFiles({
                    ...goodPackage({
                        dependencies: { newer: '^1', older: '^1' },
                        peerDependencies: { unpinned: '^1' },
                    }),
                    'node_modules/newer/package.json': JSON.stringify({
                        engines: { node: '>=24' },
                    }),
                    'node_modules/older/package.json': JSON.stringify({
                        engines: { node: '>=20' },
                    }),
                    'node_modules/unpinned/package.json': JSON.stringify({}),
                });

                const { problems } = await checkPackage({ profile: 'esm-only', cwd, tsc });

                expect(problems).to.deep.equal([
                    `engines.node: ">=22" allows Node.js 22.0.0, which newer doesn't support (">=24"). Raise the floor to match.`,
                ]);
            }
        );

        withWorkspace.test(
            'Reports a dependency that is not installed',
            async ({ cwd, writeFiles }) => {
                await writeFiles(goodPackage({ optionalDependencies: { missing: '^1' } }));

                const { problems } = await checkPackage({ profile: 'esm-only', cwd, tsc });

                expect(problems).to.deep.equal([
                    "engines.node: missing is not installed, so its engines can't be checked.",
                ]);
            }
        );

        withWorkspace.test(
            'Reports dependencies in code-unit order',
            async ({ cwd, writeFiles }) => {
                await writeFiles(
                    goodPackage({ optionalDependencies: { a_b: '^1', 'a-b': '^1', b: '^1' } })
                );

                const { problems } = await checkPackage({ profile: 'esm-only', cwd, tsc });

                expect(problems).to.deep.equal([
                    "engines.node: a-b is not installed, so its engines can't be checked.",
                    "engines.node: a_b is not installed, so its engines can't be checked.",
                    "engines.node: b is not installed, so its engines can't be checked.",
                ]);
            }
        );

        withWorkspace.test(
            'Reports @types/node newer than the floor',
            async ({ cwd, writeFiles }) => {
                await writeFiles({
                    ...goodPackage(),
                    'node_modules/@types/node/package.json': JSON.stringify({
                        name: '@types/node',
                        version: '24.1.0',
                        types: 'index.d.ts',
                    }),
                    'node_modules/@types/node/index.d.ts': '',
                });

                const { problems } = await checkPackage({ profile: 'esm-only', cwd, tsc });

                expect(problems).to.deep.equal([
                    `@types/node: 24.1.0 is installed, but engines.node ">=22" needs @types/node 22, so source can't use a newer API.`,
                ]);
            }
        );

        withWorkspace.test(
            'Accepts @types/node matching the floor',
            async ({ cwd, writeFiles }) => {
                await writeFiles({
                    ...goodPackage(),
                    'node_modules/@types/node/package.json': JSON.stringify({
                        name: '@types/node',
                        version: '22.3.0',
                        types: 'index.d.ts',
                    }),
                    'node_modules/@types/node/index.d.ts': '',
                });

                const { problems } = await checkPackage({ profile: 'esm-only', cwd, tsc });

                expect(problems).to.deep.equal([]);
            }
        );

        withWorkspace.test(
            "Reports tsconfig.json extending another floor's config",
            async ({ cwd, writeFiles }) => {
                await writeFiles({
                    ...goodPackage(),
                    'pkg/tsconfig.json': JSON.stringify({ extends: '../configs/node-24.json' }),
                });

                const { problems } = await checkPackage({
                    floorTsconfig: './configs/node-{major}.json',
                    profile: 'esm-only',
                    cwd,
                    tsc,
                });

                expect(problems).to.deep.equal([
                    'tsconfig.json: extends "../configs/node-24.json", but engines.node ">=22" needs "../configs/node-22.json".',
                ]);
            }
        );

        withWorkspace.test(
            "Accepts tsconfig.json extending the floor's config",
            async ({ cwd, writeFiles }) => {
                await writeFiles({
                    ...goodPackage(),
                    'pkg/tsconfig.json': JSON.stringify({ extends: '../configs/node-22.json' }),
                });

                const { problems } = await checkPackage({
                    floorTsconfig: './configs/node-{major}.json',
                    profile: 'esm-only',
                    cwd,
                    tsc,
                });

                expect(problems).to.deep.equal([]);
            }
        );

        withWorkspace.test(
            "Matches a package's floor config as written",
            async ({ cwd, writeFiles }) => {
                await writeFiles({
                    ...goodPackage(),
                    'pkg/tsconfig.json': JSON.stringify({
                        extends: '@scope/configs/node-24.json',
                    }),
                });

                const { problems } = await checkPackage({
                    floorTsconfig: '@scope/configs/node-{major}.json',
                    profile: 'esm-only',
                    cwd,
                    tsc,
                });

                expect(problems).to.deep.equal([
                    'tsconfig.json: extends "@scope/configs/node-24.json", but engines.node ">=22" needs "@scope/configs/node-22.json".',
                ]);
            }
        );

        withWorkspace.test(
            "Accepts tsconfig.json extending a package's floor config",
            async ({ cwd, writeFiles }) => {
                await writeFiles({
                    ...goodPackage(),
                    'pkg/tsconfig.json': JSON.stringify({
                        extends: '@scope/configs/node-22.json',
                    }),
                });

                const { problems } = await checkPackage({
                    floorTsconfig: '@scope/configs/node-{major}.json',
                    profile: 'esm-only',
                    cwd,
                    tsc,
                });

                expect(problems).to.deep.equal([]);
            }
        );

        withWorkspace.test('Reports a missing tsconfig.json', async ({ cwd, writeFiles }) => {
            await writeFiles(goodPackage());

            const { problems } = await checkPackage({
                floorTsconfig: './configs/node-{major}.json',
                profile: 'esm-only',
                cwd,
                tsc,
            });

            expect(problems).to.deep.equal([
                'tsconfig.json: extends nothing, but engines.node ">=22" needs "../configs/node-22.json".',
            ]);
        });
    });

    suite('Declarations', () => {
        withWorkspace.test(
            'Reports an error in a published declaration',
            async ({ cwd, writeFiles }) => {
                await writeFiles({
                    ...goodPackage(),
                    'pkg/dist/index.d.ts': 'export declare const answer: Missing;\n',
                });

                const { problems } = await checkPackage({ profile: 'esm-only', cwd, tsc });

                expect(problems).to.have.length(1);
                expect(problems[0]).to.match(
                    /^tsc \(skipLibCheck: false\): dist\/index\.d\.ts\(1,30\): error TS2304/v
                );
            }
        );

        withWorkspace.test(
            'Reports errors about the check itself, and runs an older tsc without --ignoreConfig',
            async ({ cwd, writeFiles, writeScript }) => {
                await writeFiles(goodPackage());
                const oldTsc = await writeScript(
                    'bin/tsc',
                    [
                        '#!/bin/sh',
                        'if [ "$1" = "--version" ]; then echo "Version 5.9.3"; exit 0; fi',
                        'echo "error TS5023: Unknown compiler option \'$1\'."',
                        'exit 1',
                    ].join('\n')
                );

                const { problems } = await checkPackage({ cwd, profile: 'esm-only', tsc: oldTsc });

                expect(problems).to.deep.equal([
                    "tsc (skipLibCheck: false): error TS5023: Unknown compiler option '--noEmit'.",
                ]);
            }
        );

        withWorkspace.test(
            'Finds the nearest installed tsc',
            async ({ cwd, writeFiles, writeScript }) => {
                await writeFiles(goodPackage());
                await writeScript('node_modules/.bin/tsc', `#!/bin/sh\nexec "${tsc}" "$@"\n`);

                const { problems } = await checkPackage({ cwd, profile: 'esm-only' });

                expect(problems).to.deep.equal([]);
            }
        );

        withWorkspace.test(
            'Throws without a tsc to check declarations with',
            async ({ cwd, writeFiles }) => {
                await writeFiles(goodPackage());

                await expect(checkPackage({ cwd, profile: 'esm-only' })).to.be.rejectedWith(
                    CheckPackageTscError,
                    'no tsc is installed'
                );
            }
        );
    });

    suite('Declarations failures', () => {
        withWorkspace.test(
            'Throws for a tsc that is not at the path given',
            async ({ cwd, resolve, writeFiles }) => {
                await writeFiles(goodPackage());

                await expect(
                    checkPackage({ cwd, profile: 'esm-only', tsc: resolve('missing/tsc') })
                ).to.be.rejectedWith(CheckPackageTscError, 'ENOENT');
            }
        );

        withWorkspace.test(
            'Throws for a tsc that fails without reporting errors',
            async ({ cwd, writeFiles, writeScript }) => {
                await writeFiles(goodPackage());
                const crashingTsc = await writeScript(
                    'bin/tsc',
                    [
                        '#!/bin/sh',
                        'if [ "$1" = "--version" ]; then echo "Version 6.0.0"; exit 0; fi',
                        'echo "out of memory" >&2',
                        'exit 134',
                    ].join('\n')
                );

                await expect(
                    checkPackage({ cwd, profile: 'esm-only', tsc: crashingTsc })
                ).to.be.rejectedWith(CheckPackageTscError, 'exit code 134');
            }
        );

        withWorkspace.test(
            'Throws for a tsc killed by a signal',
            async ({ cwd, writeFiles, writeScript }) => {
                await writeFiles(goodPackage());
                const killedTsc = await writeScript(
                    'bin/tsc',
                    [
                        '#!/bin/sh',
                        'if [ "$1" = "--version" ]; then echo "Version 6.0.0"; exit 0; fi',
                        'echo "error TS0: partial"',
                        'kill -KILL $$',
                    ].join('\n')
                );

                await expect(
                    checkPackage({ cwd, profile: 'esm-only', tsc: killedTsc })
                ).to.be.rejectedWith(CheckPackageTscError, 'signal SIGKILL');
            }
        );

        withWorkspace.test(
            'Throws for a tsc whose version is unreadable',
            async ({ cwd, writeFiles, writeScript }) => {
                await writeFiles(goodPackage());
                const oddTsc = await writeScript('bin/tsc', '#!/bin/sh\necho "nonsense"\n');

                await expect(
                    checkPackage({ cwd, profile: 'esm-only', tsc: oddTsc })
                ).to.be.rejectedWith(CheckPackageTscError, "Can't tell the version");
            }
        );
    });

    suite('Root and package manager', () => {
        withWorkspace.test('Takes the root as a URL', async ({ cwd, resolve, writeFiles }) => {
            await writeFiles(goodPackage());

            const { problems } = await checkPackage({
                profile: 'esm-only',
                root: pathToFileURL(resolve('.')),
                cwd,
                tsc,
            });

            expect(problems).to.deep.equal([]);
        });

        withWorkspace.test('Throws without a lockfile', async ({ cwd, resolve, writeFiles }) => {
            await writeFiles(goodPackage());
            await rm(resolve('pnpm-lock.yaml'));

            await expect(checkPackage({ cwd, tsc })).to.be.rejectedWith(
                CheckPackageRootError,
                'No lockfile found'
            );
        });

        withWorkspace.test(
            'Throws for a package outside the root',
            async ({ cwd, resolve, writeFiles }) => {
                await writeFiles(goodPackage());

                await expect(checkPackage({ root: resolve('other'), cwd, tsc })).to.be.rejectedWith(
                    CheckPackageRootError,
                    'is not inside the workspace root'
                );
            }
        );

        withWorkspace.test(
            'Accepts a package in a directory whose name starts with ..',
            async ({ resolve, writeFiles }) => {
                const files = Object.fromEntries(
                    Object.entries(goodPackage()).map(([path, content]) => [
                        path.replace(/^pkg\//v, '..pkg/'),
                        content,
                    ])
                );
                await writeFiles(files);

                const { problems } = await checkPackage({
                    profile: 'esm-only',
                    root: resolve('.'),
                    cwd: resolve('..pkg'),
                    tsc,
                });

                expect(problems).to.deep.equal([]);
            }
        );

        withWorkspace.test(
            "Throws when the lockfile doesn't tell the package manager",
            async ({ cwd, resolve, writeFiles }) => {
                await writeFiles({ ...goodPackage(), 'yarn.lock': '' });
                await rm(resolve('pnpm-lock.yaml'));

                await expect(checkPackage({ root: resolve('.'), cwd, tsc })).to.be.rejectedWith(
                    CheckPackageRootError,
                    'Pass --pack-with'
                );
            }
        );

        withWorkspace.test(
            'Packs with the package manager given',
            async ({ cwd, resolve, writeFiles }) => {
                await writeFiles({ ...goodPackage(), 'yarn.lock': '' });
                await rm(resolve('pnpm-lock.yaml'));

                const { problems } = await checkPackage({
                    packWith: 'pnpm',
                    profile: 'esm-only',
                    root: resolve('.'),
                    cwd,
                    tsc,
                });

                expect(problems).to.deep.equal([]);
            }
        );

        withWorkspace.test(
            'Every error is a CheckPackageError',
            async ({ resolve, writeFiles }) => {
                await writeFiles({ 'other/package.json': '{}' });

                await expect(
                    checkPackage({ cwd: resolve('other'), root: resolve('pkg') })
                ).to.be.rejectedWith(CheckPackageError);
            }
        );
    });
});
