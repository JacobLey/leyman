import { execFile } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { expect } from '@leyman/expect';
import { beforeEach, suite, test } from 'mocha-chain';
import { createWorkspace, goodPackage, tsc } from './lib/fixtures.js';

const execFileAsync = promisify(execFile);

suite('cli', () => {
    test('--help', async () => {
        const result = await execFileAsync('./bin.mjs', ['--help']);

        expect(result.stdout).to.contain('Check a package exactly as it would be published');
    });

    test('--version', async () => {
        const result = await execFileAsync('./bin.mjs', ['--version']);

        expect(result.stdout).to.match(/^\d+\.\d+\.\d+\n$/v);
    });

    suite('Checks a package', () => {
        const withWorkspace = beforeEach(createWorkspace);
        withWorkspace.afterEach(async ({ tmpDir }) => {
            await tmpDir.cleanup();
        });

        withWorkspace.test(
            'Prints that it found no problems',
            async ({ cwd, resolve, writeFiles }) => {
                await writeFiles({
                    ...goodPackage(),
                    'pkg/data/a.json': '{}',
                    'pkg/tsconfig.json': JSON.stringify({ extends: '../configs/node-22.json' }),
                });

                const result = await execFileAsync('./bin.mjs', [
                    '--cwd',
                    cwd,
                    '--root',
                    resolve('.'),
                    '--pack-with',
                    'pnpm',
                    '--profile',
                    'esm-only',
                    '--not-published',
                    'data',
                    '--floor-tsconfig',
                    './configs/node-{major}.json',
                    '--tsc',
                    tsc,
                ]);

                expect(result.stdout).to.equal(
                    'pkg: publint, attw, the floor, the published files and tsc found no problems\n'
                );
                expect(result.stderr).to.equal('');
            }
        );

        withWorkspace.test(
            'Packs with npm for an npm lockfile',
            async ({ cwd, resolve, writeFiles, writeScript }) => {
                await writeFiles({ ...goodPackage(), 'package-lock.json': '{}' });
                await rm(resolve('pnpm-lock.yaml'));
                // A stand-in for npm, which prints `pack --json` output as an array, and fails if pnpm does
                await writeScript(
                    'bin/npm',
                    '#!/bin/sh\nout=$(pnpm "$@") || exit $?\nprintf "[%s]" "$out"\n'
                );

                const result = await execFileAsync(
                    './bin.mjs',
                    ['--cwd', cwd, '--profile', 'esm-only', '--tsc', tsc],
                    // eslint-disable-next-line n/no-process-env -- The CLI finds npm on PATH, so the stand-in goes first
                    { env: { ...process.env, PATH: `${resolve('bin')}:${process.env.PATH ?? ''}` } }
                );

                expect(result.stdout).to.include('found no problems');
            }
        );

        withWorkspace.test('Prints problems and fails', async ({ cwd, writeFiles }) => {
            await writeFiles({ ...goodPackage(), 'pkg/data/a.json': '{}' });

            const thrown: unknown = await expect(
                execFileAsync('./bin.mjs', ['--cwd', cwd, '--profile', 'esm-only', '--tsc', tsc])
            ).to.be.rejectedWith(Error);

            expect(thrown).to.have.property('code', 1);
            expect(thrown)
                .to.have.property('stderr')
                .that.includes('files: "data" is not published');
        });

        withWorkspace.test('Prints suggestions', async ({ cwd, writeFiles }) => {
            await writeFiles(
                goodPackage({ exports: { '.': './dist/missing.js' }, type: undefined })
            );

            const thrown: unknown = await expect(
                execFileAsync('./bin.mjs', ['--cwd', cwd, '--profile', 'esm-only', '--tsc', tsc])
            ).to.be.rejectedWith(Error);

            expect(thrown)
                .to.have.property('stdout')
                .that.match(/publint suggestion \w+:/v);
        });

        withWorkspace.test(
            'Fails when the check itself cannot run',
            async ({ cwd, writeFiles }) => {
                await writeFiles(goodPackage());

                const thrown: unknown = await expect(
                    execFileAsync('./bin.mjs', ['--cwd', cwd, '--profile', 'esm-only'])
                ).to.be.rejectedWith(Error);

                expect(thrown).to.have.property('code', 1);
                expect(thrown).to.have.property('stderr').that.includes('no tsc is installed');
            }
        );
    });

    test('Rejects unknown options', async () => {
        const thrown: unknown = await expect(
            execFileAsync('./bin.mjs', ['--unknown'])
        ).to.be.rejectedWith(Error);

        expect(thrown).to.have.property('stderr').that.includes('Unknown argument');
    });
});
