import Path from 'node:path';
import { expect } from 'chai';
import { spy, stub, verifyAndRestore } from 'sinon';
import { defaultImport } from 'default-import';
import { afterEach, beforeEach, suite, test } from 'mocha-hookup';
import { patchKey } from 'named-patch';
import { BarrelCli, yargsOutput } from '../../cli.js';
import { barrelFiles } from '../../lib/barrel.js';

suite('cli', () => {
    const stubbedOutput = beforeEach(() => ({
        outputStub: stub(yargsOutput, patchKey),
    }));

    afterEach(() => {
        verifyAndRestore();
    });

    test('Local compatibility', async () => {
        const localCli = '../../../cli.mjs';
        expect(defaultImport(await import(localCli))).to.be.an.instanceOf(BarrelCli);
    });

    suite('commands', () => {
        suite('default', () => {
            test('success', async () => {
                const buildStub = stub(barrelFiles, patchKey).callsFake(async params => {
                    expect(params).to.deep.equal({
                        cwd: process.cwd(),
                        dryRun: true,
                        ignore: ['foo'],
                        logger: console,
                    });
                    return [];
                });

                await new BarrelCli().main(['--dry-run', '--ignore', 'foo']);

                expect(buildStub.callCount).to.equal(1);
            });

            stubbedOutput.test('failure', async ({ outputStub }) => {
                const buildSpy = spy(barrelFiles, patchKey);
                outputStub.callsFake((err, argv, log) => {
                    expect(err).to.have.property('message', 'Unknown arguments: unknown, option');
                    expect(log.startsWith('barrelify')).to.equal(true);
                    expect(log.endsWith('Unknown arguments: unknown, option')).to.equal(true);
                });

                await new BarrelCli().main(['--unknown', '--option']);

                expect(buildSpy.callCount).to.equal(0);
                expect(outputStub.callCount).to.equal(1);
            });
        });

        suite('ci', () => {
            test('success', async () => {
                const buildStub = stub(barrelFiles, patchKey).callsFake(async params => {
                    expect(params).to.deep.equal({
                        cwd: Path.resolve('..'),
                        dryRun: true,
                        ignore: undefined,
                        logger: console,
                    });
                    return [];
                });

                await new BarrelCli().main(['--ci', '--cwd', '..']);

                expect(buildStub.callCount).to.equal(1);
                expect(process.exitCode).to.equal(undefined);
            });

            test('failure', async () => {
                const errorStub = stub(console, 'error').callsFake(msg => {
                    expect(msg).to.equal('Files are not built');
                });

                stub(barrelFiles, patchKey).resolves(['<file-path>']);
                const oldExitCode = process.exitCode;

                await new BarrelCli().main(['--ci']);

                expect(process.exitCode).to.equal(1);
                process.exitCode = oldExitCode;

                expect(errorStub.callCount).to.equal(1);
            });
        });
    });

    suite('yargsOutput', () => {
        stubbedOutput.test('Pipes to console.log', ({ outputStub }) => {
            const logStub = stub(console, 'log').callsFake((...args) => {
                expect(args).to.deep.equal(['<log-data>']);
            });

            outputStub.wrappedMethod(null, {}, '<log-data>');

            expect(logStub.callCount).to.equal(1);
        });

        stubbedOutput.test('Ignores empty text', ({ outputStub }) => {
            const logSpy = spy(console, 'log');

            outputStub.wrappedMethod(null, {}, '');

            expect(logSpy.callCount).to.equal(0);
        });
    });
});
