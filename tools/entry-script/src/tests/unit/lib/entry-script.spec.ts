import Path from 'node:path';
import { beforeEach, suite, test } from 'mocha-chain';
import { runAsMain } from '#entry-script';
import { MainNotImplementedError } from '#not-implemented-error';
import { expect } from '../../chai-hooks.js';
import entryScriptInstance from '../../data/entry-script-instance.js';
import EntryScriptStatic from '../../data/entry-script-static.js';
import { tracker } from '../../data/tracker.js';

suite('EntryScript', () => {
    suite('runAsMain', () => {
        beforeEach(() => {
            delete tracker.value;
            expect(tracker.value).to.equal(undefined);
        });

        test('static', async () => {
            await runAsMain(Path.resolve(import.meta.dirname, '../../data/entry-script-static.js'));

            expect(tracker.value).to.equal(EntryScriptStatic);
        });

        test('success', async () => {
            await runAsMain(
                Path.resolve(import.meta.dirname, '../../data/entry-script-instance.js')
            );

            expect(tracker.value).to.equal(entryScriptInstance);
        });

        suite('failure', () => {
            test('Static method not implemented', async () => {
                await expect(
                    runAsMain(
                        Path.resolve(
                            import.meta.dirname,
                            '../../data/entry-script-static-invalid.js'
                        )
                    )
                ).to.eventually.be.rejectedWith(
                    MainNotImplementedError,
                    '"main" not implemented on EntryScript child class.'
                );
            });

            test('Instance method not implemented', async () => {
                await expect(
                    runAsMain(
                        Path.resolve(
                            import.meta.dirname,
                            '../../data/entry-script-instance-invalid.js'
                        )
                    )
                ).to.eventually.be.rejectedWith(
                    MainNotImplementedError,
                    '"main" not implemented on EntryScript child instance.'
                );
            });

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
        });
    });
});
