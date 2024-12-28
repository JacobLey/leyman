import { exec } from 'node:child_process';
import Path from 'node:path';
import { promisify } from 'node:util';
import { suite, test } from 'mocha-chain';
import { expect } from '../chai-hooks.js';

const execAsync = promisify(exec);

suite('cli', () => {
    test('--help', async () => {
        const result = await execAsync('./bin.mjs --help');

        expect(result.stdout).to.contain('Write index.ts barrel files');
        expect(result.stderr).to.equal('');
    });

    test('--version', async () => {
        const result = await execAsync('./bin.mjs --version');

        expect(result.stdout).to.match(/\d+.\d+.\d+/u);
        expect(result.stderr).to.equal('');
    });

    suite('commands', () => {
        suite('default/barrel', () => {
            test('success', async () => {
                const result = await execAsync('./bin.mjs --ci=false --dry-run --ignore=foo');

                expect(result.stdout).to.equal(
                    Path.join(import.meta.dirname, '../../../src/tests/data/wrong/index.ts\n')
                );
                expect(result.stderr).to.equal('');
            });

            test('unknown options', async () => {
                await expect(execAsync('./bin.mjs --unknown --option'))
                    .to.eventually.be.rejectedWith(Error)
                    .that.has.property('stderr')
                    .that.contain('Unknown arguments: unknown, option');
            });

            test('ci', async () => {
                const result = await execAsync('./bin.mjs --ci --ignore=**/wrong/**');

                expect(result.stdout).to.equal('');
                expect(result.stderr).to.equal('');
            });

            test('failure', async () => {
                await expect(execAsync('./bin.mjs barrel --ci')).to.eventually.be.rejectedWith(
                    Error,
                    'Files are not built'
                );
            });
        });
    });
});
