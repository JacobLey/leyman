import { exec } from 'node:child_process';
import Path from 'node:path';
import { promisify } from 'node:util';
import { suite, test } from 'mocha-chain';
import { expect } from '../chai-hooks.js';

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
        suite('default/load-populate-files', () => {
            test('unknown options', async () => {
                await expect(execAsync('./bin.mjs --unknown --option'))
                    .to.eventually.be.rejectedWith(Error)
                    .that.has.property('stderr')
                    .that.contain('Unknown arguments: unknown, option');
            });

            test('invalid config file', async () => {
                await expect(execAsync('./bin.mjs --config-file ./does-not-exist.json'))
                    .to.eventually.be.rejectedWith(Error)
                    .that.has.property('stderr')
                    .that.contain(
                        `Error: ENOENT: no such file or directory, open '${Path.join(import.meta.dirname, '../../../does-not-exist.json')}'`
                    );
            });
        });
    });
});
