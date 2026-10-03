import { exec } from 'node:child_process';
import Path from 'node:path';
import { promisify } from 'node:util';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';

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
                const thrown: unknown = await expect(
                    execAsync('./bin.mjs --unknown --option')
                ).to.be.rejectedWith(Error);
                expect(thrown)
                    .to.have.property('stderr')
                    .that.includes('Unknown arguments: unknown, option');
            });

            test('ci', async () => {
                const result = await execAsync('./bin.mjs --ci --ignore=**/wrong/**');

                expect(result.stdout).to.equal('');
                expect(result.stderr).to.equal('');
            });

            test('failure', async () => {
                const thrown: unknown = await expect(
                    execAsync('./bin.mjs barrel --ci')
                ).to.be.rejectedWith(Error);
                expect(thrown).to.have.property('message').that.includes('Files are not built');
            });
        });
    });
});
