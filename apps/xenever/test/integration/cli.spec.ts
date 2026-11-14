import { exec } from 'node:child_process';
import { access, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { expect } from '@leyman/expect';
import { formatText } from 'format-file';
import { parseManifest, verify } from 'generated-signature';
import { beforeEach, suite, test } from 'mocha-chain';
import { generate, loadXsd } from 'xenever/xsd';
import { createTmpDir } from './lib/fixtures.js';

const execAsync = promisify(exec);

suite('cli', () => {
    test('--help', async () => {
        const result = await execAsync('./bin.mjs --help');

        expect(result.stdout).to.contain('Write a TypeScript schema');
        expect(result.stderr).to.equal('');
    });

    test('--version', async () => {
        const result = await execAsync('./bin.mjs --version');

        expect(result.stdout).to.match(/^\d+\.\d+\.\d+\n$/v);
        expect(result.stderr).to.equal('');
    });

    test('input is required', async () => {
        const thrown: unknown = await expect(
            execAsync('./bin.mjs --check=false')
        ).to.be.rejectedWith(Error);
        expect(thrown).to.have.property('stderr').that.includes('Not enough non-option arguments');
    });

    suite('writes files', () => {
        const withTmpDir = beforeEach(createTmpDir);
        withTmpDir.afterEach(async ctx => {
            await ctx.tmpDir.cleanup();
        });

        withTmpDir.test('writes the output next to the XSD, and logs the file', async ctx => {
            const result = await execAsync(
                `./bin.mjs main.xsd --check=false --cwd ${ctx.tmpDir.path}`
            );

            expect(result.stdout).to.equal(`${ctx.resolve('main.ts')}\n`);
            expect(result.stderr).to.equal('');
            expect(await ctx.read('main.ts')).to.contain('export const order');
        });

        withTmpDir.test('-o', async ctx => {
            await execAsync(
                `./bin.mjs main.xsd -o types/order.ts --check=false --cwd ${ctx.tmpDir.path}`
            );

            await access(ctx.resolve('types/order.ts'));
        });

        withTmpDir.test('--bigint and --ordered', async ctx => {
            await execAsync(
                `./bin.mjs main.xsd --bigint --ordered order --check=false --cwd ${ctx.tmpDir.path}`
            );

            expect(await ctx.read('main.ts')).to.equal(
                await formatText(
                    generate(
                        await loadXsd(ctx.resolve('main.xsd'), { bigint: true, ordered: ['order'] })
                    ).text,
                    { ext: '.ts' }
                )
            );
        });

        withTmpDir.test('--catalog', async ctx => {
            await ctx.edit('main.xsd', 'common.xsd', 'https://example.test/c.xsd?v=1');
            await ctx.write('schemas/common.xsd', await ctx.read('common.xsd'));

            await execAsync(
                `./bin.mjs main.xsd --catalog 'https://example.test/c.xsd?v=1=schemas/common.xsd' --check=false --cwd ${ctx.tmpDir.path}`
            );

            await access(ctx.resolve('main.ts'));
        });

        withTmpDir.test('--catalog fails on an entry without a path', async ctx => {
            const thrown: unknown = await expect(
                execAsync(
                    `./bin.mjs main.xsd --catalog urn:common --check=false --cwd ${ctx.tmpDir.path}`
                )
            ).to.be.rejectedWith(Error);
            expect(thrown)
                .to.have.property('stderr')
                .that.includes('--catalog "urn:common" is not <location>=<path>');
            await expect(access(ctx.resolve('main.ts'))).to.be.rejectedWith(Error);
        });

        withTmpDir.test('--catalog fails on an entry without a location', async ctx => {
            const thrown: unknown = await expect(
                execAsync(
                    `./bin.mjs main.xsd --catalog =a.xsd --check=false --cwd ${ctx.tmpDir.path}`
                )
            ).to.be.rejectedWith(Error);
            expect(thrown).to.have.property('stderr').that.includes('is not <location>=<path>');
        });

        withTmpDir.test('--catalog fails on a location mapped twice', async ctx => {
            const thrown: unknown = await expect(
                execAsync(
                    `./bin.mjs main.xsd --catalog a=b.xsd --catalog a=c.xsd --check=false --cwd ${ctx.tmpDir.path}`
                )
            ).to.be.rejectedWith(Error);
            expect(thrown).to.have.property('stderr').that.includes('--catalog maps "a" twice');
        });

        withTmpDir.test('--signed and --force', async ctx => {
            await writeFile(ctx.resolve('main.ts'), 'handwritten\n');

            await execAsync(
                `./bin.mjs main.xsd --signed --force --check=false --cwd ${ctx.tmpDir.path}`
            );

            expect(verify(await ctx.read('main.ts'))).to.deep.equal({ status: 'valid' });
        });

        withTmpDir.test('--manifest', async ctx => {
            await execAsync(
                `./bin.mjs main.xsd --manifest manifest.json --check=false --cwd ${ctx.tmpDir.path}`
            );

            const { files } = parseManifest(await ctx.read('manifest.json'));
            expect(files['main.ts']?.inputs).to.include.keys('./main.xsd', './common.xsd');
        });

        withTmpDir.test('does not log files that are up to date', async ctx => {
            await execAsync(`./bin.mjs main.xsd --check=false --cwd ${ctx.tmpDir.path}`);

            const result = await execAsync(
                `./bin.mjs main.xsd --check=false --cwd ${ctx.tmpDir.path}`
            );

            expect(result.stdout).to.equal('');
        });

        withTmpDir.test('--check passes when up to date', async ctx => {
            await execAsync(`./bin.mjs main.xsd --check=false --cwd ${ctx.tmpDir.path}`);

            const result = await execAsync(`./bin.mjs main.xsd --check --cwd ${ctx.tmpDir.path}`);

            expect(result.stdout).to.equal('');
            expect(result.stderr).to.equal('');
        });

        withTmpDir.test('--check fails when out of date, without writing', async ctx => {
            await expect(
                execAsync(`./bin.mjs main.xsd --check --cwd ${ctx.tmpDir.path}`)
            ).to.be.rejectedWith(Error);
            await expect(access(ctx.resolve('main.ts'))).to.be.rejectedWith(Error);
        });

        withTmpDir.test('--ci, which --check aliases, passes when up to date', async ctx => {
            await execAsync(`./bin.mjs main.xsd --no-ci --cwd ${ctx.tmpDir.path}`);

            const result = await execAsync(`./bin.mjs main.xsd --ci --cwd ${ctx.tmpDir.path}`);

            expect(result.stdout).to.equal('');
            expect(result.stderr).to.equal('');
        });

        withTmpDir.test('--dry-run does not write', async ctx => {
            await execAsync(`./bin.mjs main.xsd --check=false --dry-run --cwd ${ctx.tmpDir.path}`);

            await expect(access(ctx.resolve('main.ts'))).to.be.rejectedWith(Error);
        });

        withTmpDir.test('fails on an invalid schema, saying where', async ctx => {
            await ctx.edit('common.xsd', 'xs:token', 'xs:nope');

            const thrown: unknown = await expect(
                execAsync(`./bin.mjs main.xsd --check=false --cwd ${ctx.tmpDir.path}`)
            ).to.be.rejectedWith(Error);
            expect(thrown)
                .to.have.property('stderr')
                .that.includes(`in ${ctx.resolve('common.xsd')}, line 2`);
        });
    });
});
