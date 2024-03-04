import Path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'chai';
import { afterEach, beforeEach, suite, test } from 'mocha-hookup';
import { fake, spy, stub, verifyAndRestore } from 'sinon';
import * as EntryScript from 'entry-script';
import { runAsMain } from '#entry-script';
import EntryScriptMock from '../../data/entry-script-mock.js';

suite('EntryScript', () => {
    afterEach(() => {
        verifyAndRestore();
    });

    suite('create', () => {
        test('success', async () => {
            expect(await EntryScript.EntryScript.create()).to.be.an.instanceOf(
                EntryScript.EntryScript
            );
        });
    });

    suite('runAsMain', () => {
        const withStubbedEntryScript = beforeEach(async () => {
            const entryScript = await EntryScriptMock.create();
            stub(EntryScriptMock, 'create').callsFake(async () => entryScript);

            return { entryScript };
        });

        withStubbedEntryScript.test('success', async ({ entryScript }) => {
            const startSpy = spy(entryScript, 'start');
            const finishSpy = spy(entryScript, 'finish');

            await runAsMain(
                Path.resolve(
                    Path.dirname(fileURLToPath(import.meta.url)),
                    '../../data/entry-script-mock.js'
                )
            );

            expect(startSpy.callCount).to.equal(1);
            expect(startSpy.calledBefore(finishSpy)).to.equal(true);
            expect(finishSpy.callCount).to.equal(1);
        });

        suite('failure', () => {
            test('No URL exists', async () => {
                await runAsMain();
            });

            test('URL is not js file', async () => {
                await runAsMain('/does/not/exist');
            });

            test('Different entry point', async () => {
                await runAsMain(process.argv[1]);
            });

            test('Entry module is not EntryScript', async () => {
                await runAsMain(import.meta.url);
            });

            withStubbedEntryScript.test(
                'Emits runtime error',
                async ({ entryScript }) => {
                    const error = new Error('<ERROR>');

                    stub(entryScript, 'start').callsFake(() => {
                        throw error;
                    });
                    const finishSpy = stub(entryScript, 'finish');
                    const listenerStub = fake(
                        (err: unknown, event: CustomEvent<unknown>) => [
                            err,
                            event,
                        ]
                    );

                    entryScript.on(EntryScript.runtimeError, listenerStub);

                    let caughtError: unknown;
                    try {
                        await runAsMain(
                            Path.resolve(
                                Path.dirname(fileURLToPath(import.meta.url)),
                                '../../data/entry-script-mock.js'
                            )
                        );
                    } catch (err) {
                        caughtError = err;
                    }

                    expect(caughtError).to.eq(error);
                    expect(finishSpy.callCount).to.equal(1);
                    expect(listenerStub.callCount).to.equal(1);
                    expect(listenerStub.getCall(0).args[0]).to.eq(error);
                }
            );
        });
    });
});
