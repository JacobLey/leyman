import { mkdir, rm, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { expect } from '@leyman/expect';
import { beforeEach, suite, test } from 'mocha-chain';
import { runAsMain } from '#entry-script';
import { MainNotImplementedError } from '#not-implemented-error';
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

        test('Path with characters that are special in a URL', async () => {
            const dir = Path.resolve(import.meta.dirname, '../../data/has#hash%20');
            await mkdir(dir, { recursive: true });
            try {
                const file = Path.join(dir, 'entry.js');
                await writeFile(
                    file,
                    "export { EntryScriptStatic as default } from '../tracker.js';\n"
                );

                await runAsMain(file);

                expect(tracker.value).to.equal(EntryScriptStatic);
            } finally {
                await rm(dir, { recursive: true, force: true });
            }
        });

        suite('failure', () => {
            test('Static method not implemented', async () => {
                const thrown: unknown = await expect(
                    runAsMain(
                        Path.resolve(
                            import.meta.dirname,
                            '../../data/entry-script-static-invalid.js'
                        )
                    )
                ).to.be.rejectedWith(MainNotImplementedError);
                expect(thrown)
                    .to.have.property('message')
                    .that.includes('"main" not implemented on EntryScript child class.');
            });

            test('Instance method not implemented', async () => {
                const thrown: unknown = await expect(
                    runAsMain(
                        Path.resolve(
                            import.meta.dirname,
                            '../../data/entry-script-instance-invalid.js'
                        )
                    )
                ).to.be.rejectedWith(MainNotImplementedError);
                expect(thrown)
                    .to.have.property('message')
                    .that.includes('"main" not implemented on EntryScript child instance.');
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
