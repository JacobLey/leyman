import type { TmpDirContext } from './lib/fixtures.js';
import { exec } from 'node:child_process';
import { access, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { expect } from '@leyman/expect';
import { verify } from 'generated-signature';
import { beforeEach, suite, test } from 'mocha-chain';
import { createTmpDir, userSchema } from './lib/fixtures.js';
import { startSchemaServer } from './lib/server.js';

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

        withTmpDir.test('--signed and --force', async ctx => {
            await ctx.writeJson('user.json', userSchema);
            await writeFile(ctx.resolve('user.ts'), 'handwritten\n');

            await execAsync(
                `./bin.mjs user.json --signed --force --ci=false --cwd ${ctx.tmpDir.path}`
            );

            expect(verify(await ctx.read('user.ts'))).to.deep.equal({ status: 'valid' });
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

        withTmpDir.test('--typed-min-items', async ctx => {
            await ctx.writeJson('user.json', { type: 'array', minItems: 1 });

            await execAsync(
                `./bin.mjs user.json --ci=false --typed-min-items 0 --cwd ${ctx.tmpDir.path}`
            );

            expect(await ctx.read('user.ts')).not.to.contain('[unknown');
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

        suite('URLs', () => {
            /**
             * Generate types for a schema that references the test server.
             *
             * @param ctx - test context
             * @param flags - CLI flags
             * @returns stdout and stderr
             */
            const generateRemote = async (
                ctx: TmpDirContext,
                flags: string
            ): Promise<{ stderr: string; stdout: string }> => {
                const server = await startSchemaServer();
                try {
                    await ctx.writeJson('user.json', { $ref: `${server.url}/remote.json` });
                    return await execAsync(
                        `./bin.mjs user.json --ci=false ${flags} --cwd ${ctx.tmpDir.path}`
                    );
                } finally {
                    await server.close();
                }
            };

            withTmpDir.test('--fetch-host', async ctx => {
                await generateRemote(ctx, '--fetch-host example.test --fetch-host 127.0.0.1');

                expect(await ctx.read('user.ts')).to.contain('export type Remote');
            });

            withTmpDir.test('--fetch-host fails on other hosts', async ctx => {
                const thrown: unknown = await expect(
                    generateRemote(ctx, '--fetch-host example.test')
                ).to.be.rejectedWith(Error);
                expect(thrown).to.have.property('stderr').that.includes('not an allowed host');
            });

            withTmpDir.test('--no-fetch', async ctx => {
                const thrown: unknown = await expect(
                    generateRemote(ctx, '--no-fetch')
                ).to.be.rejectedWith(Error);
                expect(thrown).to.have.property('stderr').that.includes('disabled');
            });

            withTmpDir.test('--no-fetch with --fetch-host', async ctx => {
                const thrown: unknown = await expect(
                    generateRemote(ctx, '--no-fetch --fetch-host example.test')
                ).to.be.rejectedWith(Error);
                expect(thrown).to.have.property('stderr').that.includes('--no-fetch disables');
            });
        });
    });
});
