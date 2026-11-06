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
