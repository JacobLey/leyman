import { exec } from 'node:child_process';
import Path from 'node:path';
import { promisify } from 'node:util';
import { expect } from '@leyman/expect';
import { beforeEach, suite, test } from 'mocha-chain';
import { barrel, createTmpDir, HEADER } from './lib/fixtures.js';

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
                    Path.join(import.meta.dirname, '../../test/data/wrong/index.ts\n')
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

            suite('Writes files', () => {
                const withTmpDir = beforeEach(createTmpDir);
                withTmpDir.afterEach(async ctx => {
                    await ctx.tmpDir.cleanup();
                });

                withTmpDir.test('Writes and logs updated files', async ctx => {
                    await ctx.writeFiles({ 'a.ts': '', 'index.ts': HEADER });

                    const result = await execAsync(`./bin.mjs --ci=false --cwd ${ctx.tmpDir.path}`);

                    expect(result.stdout).to.equal(`${ctx.resolve('index.ts')}\n`);
                    expect(result.stderr).to.equal('');
                    expect(await ctx.read('index.ts')).to.equal(barrel("export * from './a.js';"));
                });

                withTmpDir.test('--ci does not write', async ctx => {
                    await ctx.writeFiles({ 'a.ts': '', 'index.ts': HEADER });

                    const thrown: unknown = await expect(
                        execAsync(`./bin.mjs --ci --cwd ${ctx.tmpDir.path}`)
                    ).to.be.rejectedWith(Error);
                    expect(thrown).to.have.property('stdout', `${ctx.resolve('index.ts')}\n`);
                    expect(thrown).to.have.property('message').that.includes('Files are not built');
                    expect(await ctx.read('index.ts')).to.equal(HEADER);
                });
            });
        });
    });
});
