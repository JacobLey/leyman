import { exec } from 'node:child_process';
import { access } from 'node:fs/promises';
import { promisify } from 'node:util';
import { expect } from '@leyman/expect';
import { beforeEach, suite, test } from 'mocha-chain';
import { createTmpDir, userSchema } from './lib/fixtures.js';

const execAsync = promisify(exec);

suite('cli', () => {
    test('--help', async () => {
        const result = await execAsync('./bin.mjs --help');

        expect(result.stdout).to.contain('Write TypeScript types for a JSON Schema file');
        expect(result.stderr).to.equal('');
    });

    test('--version', async () => {
        const result = await execAsync('./bin.mjs --version');

        expect(result.stdout).to.match(/\d+.\d+.\d+/u);
        expect(result.stderr).to.equal('');
    });

    test('input is required', async () => {
        const thrown: unknown = await expect(execAsync('./bin.mjs --ci=false')).to.be.rejectedWith(
            Error
        );
        expect(thrown).to.have.property('stderr').that.includes('Not enough non-option arguments');
    });

    suite('writes files', () => {
        const withTmpDir = beforeEach(createTmpDir);
        withTmpDir.afterEach(async ctx => {
            await ctx.tmpDir.cleanup();
        });

        withTmpDir.test('writes types next to the schema, and logs the file', async ctx => {
            await ctx.writeJson('user.json', userSchema);

            const result = await execAsync(
                `./bin.mjs user.json --ci=false --cwd ${ctx.tmpDir.path}`
            );

            expect(result.stdout).to.equal(`${ctx.resolve('user.ts')}\n`);
            expect(result.stderr).to.equal('');
            expect(await ctx.read('user.ts')).to.contain('export type Schema');
        });

        withTmpDir.test('--output and --name', async ctx => {
            await ctx.writeJson('user.json', userSchema);

            await execAsync(
                `./bin.mjs user.json -o types/user-types.ts --name User --ci=false --cwd ${ctx.tmpDir.path}`
            );

            expect(await ctx.read('types/user-types.ts')).to.contain('export type User');
        });

        withTmpDir.test('does not log files that are up to date', async ctx => {
            await ctx.writeJson('user.json', userSchema);
            await execAsync(`./bin.mjs user.json --ci=false --cwd ${ctx.tmpDir.path}`);

            const result = await execAsync(
                `./bin.mjs user.json --ci=false --cwd ${ctx.tmpDir.path}`
            );

            expect(result.stdout).to.equal('');
        });

        withTmpDir.test('--ci passes when up to date', async ctx => {
            await ctx.writeJson('user.json', userSchema);
            await execAsync(`./bin.mjs user.json --ci=false --cwd ${ctx.tmpDir.path}`);

            const result = await execAsync(`./bin.mjs user.json --ci --cwd ${ctx.tmpDir.path}`);

            expect(result.stdout).to.equal('');
            expect(result.stderr).to.equal('');
        });

        withTmpDir.test('--ci fails when out of date', async ctx => {
            await ctx.writeJson('user.json', userSchema);

            await expect(
                execAsync(`./bin.mjs user.json --ci --cwd ${ctx.tmpDir.path}`)
            ).to.be.rejectedWith(Error);
            await expect(access(ctx.resolve('user.ts'))).to.be.rejectedWith(Error);
        });

        withTmpDir.test('--dry-run does not write', async ctx => {
            await ctx.writeJson('user.json', userSchema);

            await execAsync(`./bin.mjs user.json --ci=false --dry-run --cwd ${ctx.tmpDir.path}`);

            await expect(access(ctx.resolve('user.ts'))).to.be.rejectedWith(Error);
        });

        withTmpDir.test('fails on an invalid schema', async ctx => {
            await ctx.writeJson('user.json', {
                type: 'object',
                properties: { a: { type: 'foo' } },
            });

            const thrown: unknown = await expect(
                execAsync(`./bin.mjs user.json --ci=false --cwd ${ctx.tmpDir.path}`)
            ).to.be.rejectedWith(Error);
            expect(thrown).to.have.property('stderr').that.includes('#/properties/a/type');
        });

        withTmpDir.test('OpenAPI document', async ctx => {
            await ctx.writeJson('openapi.json', {
                openapi: '3.0.3',
                info: { title: 'API', version: '1.0.0' },
                paths: {},
                components: { schemas: { User: userSchema } },
            });

            await execAsync(`./bin.mjs openapi.json --ci=false --cwd ${ctx.tmpDir.path}`);

            expect(await ctx.read('openapi.ts')).to.contain('export type User');
        });

        withTmpDir.test('--no-strict', async ctx => {
            await ctx.writeJson('user.json', { type: 'string', unknownKeyword: true });

            await execAsync(`./bin.mjs user.json --ci=false --no-strict --cwd ${ctx.tmpDir.path}`);

            expect(await ctx.read('user.ts')).to.contain('export type Schema');
        });

        withTmpDir.test('--open-api-30', async ctx => {
            await ctx.writeJson('user.json', { type: 'string', nullable: true });

            await execAsync(
                `./bin.mjs user.json --ci=false --open-api-30 --cwd ${ctx.tmpDir.path}`
            );

            expect(await ctx.read('user.ts')).to.contain('null');
        });
    });
});
