import { exec } from 'node:child_process';
import Path from 'node:path';
import { promisify } from 'node:util';
import type { Context } from 'mocha';
import { suite, test } from 'mocha-chain';
import { expect } from '../chai-hooks.js';

const execAsync = promisify(exec);
const projectRoot = Path.join(import.meta.dirname, '../../..');

suite('cli', () => {
    test('--help', async () => {
        const result = await execAsync('./bin.mjs --help');

        expect(result.stdout).to.contain(
            "Write tsconfig.json's references field based on Nx detected dependencies"
        );
        expect(result.stderr).to.equal('');
    });

    test('--version', async () => {
        const result = await execAsync('./bin.mjs --version');

        expect(result.stdout).to.match(/\d+.\d+.\d+/u);
        expect(result.stderr).to.equal('');
    });

    suite('commands', () => {
        suite('default/update-ts-references', () => {
            test('success', async function (this: Context) {
                // Generating task graph is especially slow on CI
                this.timeout(5000);

                const result = await execAsync(`./bin.mjs --project-root ${projectRoot} --ci`);

                expect(result.stdout).to.equal('');
                expect(result.stderr).to.equal('');
            });

            test('unknown options', async () => {
                await expect(execAsync('./bin.mjs --unknown --option'))
                    .to.eventually.be.rejectedWith(Error)
                    .that.has.property('stderr')
                    .that.contain('Unknown arguments: unknown, option');
            });

            test('failure', async () => {
                const fakeRoot = Path.join(projectRoot, 'does-not-exist');
                await expect(
                    execAsync(`./bin.mjs --project-root ${fakeRoot} --ci`)
                ).to.eventually.be.rejectedWith(Error, `Directory not found: ${fakeRoot}`);
            });
        });
    });
});
