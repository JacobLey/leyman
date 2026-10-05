import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';

const execAsync = promisify(exec);

suite('cli', () => {
    test('--help', async () => {
        const result = await execAsync('./bin.mjs --help');

        expect(result.stdout).to.contain('Inject Nx targets as high level workflows');
        expect(result.stderr).to.equal('');
    });

    test('--version', async () => {
        const result = await execAsync('./bin.mjs --version');

        expect(result.stdout).to.match(/\d+.\d+.\d+/u);
        expect(result.stderr).to.equal('');
    });

    suite('commands', () => {
        suite('default/lifecycle', () => {
            test('unknown options', async () => {
                const thrown: unknown = await expect(
                    execAsync('./bin.mjs --unknown --option')
                ).to.be.rejectedWith(Error);
                expect(thrown)
                    .to.have.property('stderr')
                    .that.includes('Unknown arguments: unknown, option');
            });
        });
    });
});
