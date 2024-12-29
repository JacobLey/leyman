import { exec } from 'node:child_process';
import Path from 'node:path';
import { promisify } from 'node:util';
import { suite, test } from 'mocha-chain';
import { expect } from '../chai-hooks.js';

const execAsync = promisify(exec);

suite('cli', () => {
    test('--help', async () => {
        const result = await execAsync('./bin.mjs --help');

        expect(result.stdout).to.contain('Read pre-generated content and write to file');
        expect(result.stderr).to.equal('');
    });

    test('--version', async () => {
        const result = await execAsync('./bin.mjs --version');

        expect(result.stdout).to.match(/\d+.\d+.\d+/u);
        expect(result.stderr).to.equal('');
    });

    suite('commands', () => {
        suite('default/load-populate-files', () => {
            test('success', async () => {
                const result = await execAsync(
                    './bin.mjs --cwd ./dist/tests --ci --file-path ./data/in-sync.js'
                );

                expect(result.stdout).to.equal('');
                expect(result.stderr).to.equal('');
            });

            test('missing file path', async () => {
                await expect(execAsync('./bin.mjs'))
                    .to.eventually.be.rejectedWith(Error)
                    .that.has.property('stderr')
                    .that.contain('Missing required argument: filePath');
            });

            test('unknown options', async () => {
                await expect(execAsync('./bin.mjs --filePath ignore --unknown --option'))
                    .to.eventually.be.rejectedWith(Error)
                    .that.has.property('stderr')
                    .that.contain('Unknown arguments: unknown, option');
            });

            test('ci', async () => {
                await expect(
                    execAsync('./bin.mjs --ci --file-path ./dist/tests/data/out-of-sync.js')
                ).to.eventually.be.rejectedWith(
                    Error,
                    `Error: File ${Path.join(import.meta.dirname, '../../../src/tests/data/out-of-sync.txt')} not up to date. Reason: content-changed`
                );
            });

            test('dry run', async () => {
                const failure = await execAsync(
                    './bin.mjs --ci=false --dry-run --file-path ./dist/tests/data/not-populated.js'
                );

                expect(failure.stdout).to.equal('');
                expect(failure.stderr).to.equal('');
            });

            suite('failure', () => {
                test('Not found', async () => {
                    await expect(
                        execAsync(
                            './bin.mjs --ci=false --file-path ./dist/tests/data/does-not-exist.js'
                        )
                    ).to.eventually.be.rejectedWith(
                        Error,
                        `JS file not found: ${Path.resolve('./dist/tests/data/does-not-exist.js')}`
                    );
                });

                test('File fails to load', async () => {
                    await expect(
                        execAsync(
                            './bin.mjs --ci=false --file-path ./dist/tests/data/throws-error.js'
                        )
                    ).to.eventually.be.rejectedWith(Error, "Can't load me!");
                });

                test('Invalid export syntax', async () => {
                    await expect(
                        execAsync(
                            './bin.mjs --ci=false --file-path ./dist/tests/data/invalid-export.js'
                        )
                    ).to.eventually.be.rejectedWith(
                        Error,
                        `File content does not fulfill populate-file input at: ${Path.resolve('./dist/tests/data/invalid-export.js')}`
                    );
                });
            });
        });
    });
});
