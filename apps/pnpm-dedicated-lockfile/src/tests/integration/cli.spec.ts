import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { suite, test } from 'npm-mocha-chain';
import { expect } from '../chai-hooks.js';

const execAsync = promisify(exec);

suite('cli', () => {
    test('--help', async () => {
        const result = await execAsync('./bin.mjs --help');

        expect(result.stdout).to.contain("Write lockfile based on packages's portion of lockfile");
        expect(result.stderr).to.equal('');
    });

    test('--version', async () => {
        const result = await execAsync('./bin.mjs --version');

        expect(result.stdout).to.match(/\d+.\d+.\d+/u);
        expect(result.stderr).to.equal('');
    });

    suite('commands', () => {
        suite('default/lockfile', () => {
            test('success', async () => {
                const result = await execAsync(
                    './bin.mjs --ci=false --dry-run --lockfile-name=does-not-exist'
                );

                expect(result.stdout).to.contain('');
                expect(result.stderr).to.equal('');
            });

            test('unknown options', async () => {
                await expect(execAsync('./bin.mjs --unknown --option'))
                    .to.eventually.be.rejectedWith(Error)
                    .that.has.property('stderr')
                    .that.contain('Unknown arguments: unknown, option');
            });

            test('ci', async () => {
                const result = await execAsync('./bin.mjs --ci --lockfile-name=.pnpm-lock');

                expect(result.stdout).to.equal('');
                expect(result.stderr).to.equal('');
            });

            test('failure', async () => {
                await expect(
                    execAsync('./bin.mjs lockfile --ci --lockfile-name=does-not-exist')
                ).to.eventually.be.rejectedWith(Error, 'Lockfile was not up to date');
            });
        });
    });
});
