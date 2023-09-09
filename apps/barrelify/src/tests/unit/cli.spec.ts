import Path from 'node:path';
import { expect } from 'chai';
import { afterEach, beforeEach, suite, test } from 'mocha-hookup';
import { patchKey } from 'named-patch';
import { spy, stub, verifyAndRestore } from 'sinon';
import BarrelCli, { yargsOutput } from '../../cli.js';
import { barrelFiles } from '../../lib/barrel.js';

suite('cli', () => {

    const stubbedOutput = beforeEach(() => ({
        outputStub: stub(yargsOutput, patchKey),
    }));

    afterEach(() => {
        verifyAndRestore();
    });

    suite('create', () => {

        test('success', async () => {

            const barrel = await BarrelCli.create();

            expect(barrel).to.be.an.instanceOf(BarrelCli);
        });
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

                await new BarrelCli({
                    argv: ['node', 'barrelify', '--dry-run', '--ignore', 'foo'],
                }).start();

                expect(buildStub.callCount).to.equal(1);
            });

            stubbedOutput.test('failure', async ({ outputStub }) => {

                const buildSpy = spy(barrelFiles, patchKey);
                outputStub.callsFake((err, argv, log) => {
                    expect(err).to.have.property('message', 'Unknown arguments: unknown, option');
                    expect(log.startsWith('barrelify')).to.equal(true);
                    expect(log.endsWith('Unknown arguments: unknown, option')).to.equal(true);
                });

                await new BarrelCli({
                    argv: ['node', 'barrelify', '--unknown', '--option'],
                }).start();

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

                await new BarrelCli({
                    argv: ['node', 'barrelify', '--ci', '--cwd', '..'],
                }).start();

                expect(buildStub.callCount).to.equal(1);
                expect(process.exitCode).to.equal(undefined);
            });

            test('failure', async () => {

                const errorStub = stub(console, 'error').callsFake(msg => {
                    expect(msg).to.equal('Files are not built');
                });

                stub(barrelFiles, patchKey).resolves(['<file-path>']);

                await new BarrelCli({
                    argv: ['node', 'barrelify', '--ci'],
                }).start();

                expect(process.exitCode).to.equal(1);
                delete process.exitCode;

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
