import type { TmpDirContext } from './lib/fixtures.js';
import type { SchemaServer } from './lib/server.js';
import { exec } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { expect } from '@leyman/expect';
import { GeneratedSignatureManifestError, parseManifest } from 'generated-signature';
import { geneverFile } from 'genever';
import { beforeEach, suite } from 'mocha-chain';
import { PopulateFilesOwnershipError } from 'populate-files';
import { createTmpDir } from './lib/fixtures.js';
import { startSchemaServer } from './lib/server.js';

const execAsync = promisify(exec);

suite('manifest', () => {
    const withGenerated = beforeEach(async () => {
        const [ctx, server] = await Promise.all([createTmpDir(), startSchemaServer()]);
        await Promise.all([
            ctx.writeJson('common.json', { type: 'string' }),
            ctx.writeJson('input.json', {
                type: 'object',
                properties: {
                    local: { $ref: './common.json' },
                    remote: { $ref: `${server.url}/remote.json` },
                },
            }),
        ]);
        const options = { manifest: 'manifest.json', cwd: ctx.tmpDir.path } as const;
        await geneverFile('input.json', options);
        return { ...ctx, server, options };
    });

    withGenerated.afterEach(async (ctx: TmpDirContext & { server: SchemaServer }) => {
        await Promise.all([ctx.tmpDir.cleanup(), ctx.server.close()]);
    });

    const readManifest = async (ctx: TmpDirContext) =>
        parseManifest(await ctx.read('manifest.json')).files;

    withGenerated.test('records the output and its inputs', async ctx => {
        const files = await readManifest(ctx);

        expect(Object.keys(files['input.ts']?.inputs ?? {})).to.have.members([
            './common.json',
            './input.json',
            `${ctx.server.url}/remote.json`,
            `${ctx.server.url}/remote2.json`,
            'generator',
            'options',
        ]);
    });

    withGenerated.test('check passes without fetching when nothing changed', async ctx => {
        await ctx.server.close();

        expect(await geneverFile('input.json', { ...ctx.options, check: true })).to.deep.equal({
            output: ctx.resolve('input.ts'),
            updated: false,
        });
    });

    suite('check does a full check when', () => {
        withGenerated.test('a local input changed', async ctx => {
            await ctx.writeJson('common.json', { type: 'number' });

            await expect(
                geneverFile('input.json', { ...ctx.options, check: true })
            ).to.be.rejectedWith(Error, 'content-changed');
        });

        withGenerated.test('a local input is gone', async ctx => {
            await rm(ctx.resolve('common.json'));

            await expect(
                geneverFile('input.json', { ...ctx.options, check: true })
            ).to.be.rejectedWith(Error, 'common.json');
        });

        withGenerated.test('the output was edited', async ctx => {
            await writeFile(ctx.resolve('input.ts'), `${await ctx.read('input.ts')}// edit\n`);

            await expect(
                geneverFile('input.json', { ...ctx.options, check: true })
            ).to.be.rejectedWith(PopulateFilesOwnershipError);
        });

        withGenerated.test('the output is gone', async ctx => {
            await rm(ctx.resolve('input.ts'));

            await expect(
                geneverFile('input.json', { ...ctx.options, check: true })
            ).to.be.rejectedWith(Error, 'file-not-exist');
        });

        withGenerated.test('the options changed', async ctx => {
            await expect(
                geneverFile('input.json', { ...ctx.options, check: true, name: 'Other' })
            ).to.be.rejectedWith(Error, 'content-changed');
        });

        withGenerated.test('the generator version changed', async ctx => {
            const manifest = await ctx.read('manifest.json');
            await writeFile(
                ctx.resolve('manifest.json'),
                manifest.replace(/genever@[^"]+/u, 'genever@0.0.0')
            );

            await expect(
                geneverFile('input.json', { ...ctx.options, check: true })
            ).to.be.rejectedWith(Error, 'manifest.json');
        });

        withGenerated.test('the entry has no inputs', async ctx => {
            const files = await readManifest(ctx);
            const { inputs, ...entry } = files['input.ts']!;
            await ctx.writeJson('manifest.json', { version: 1, files: { 'input.ts': entry } });

            await expect(
                geneverFile('input.json', { ...ctx.options, check: true })
            ).to.be.rejectedWith(Error, 'manifest.json');
        });

        withGenerated.test('the manifest is invalid', async ctx => {
            await writeFile(ctx.resolve('manifest.json'), '{');

            await expect(
                geneverFile('input.json', { ...ctx.options, check: true })
            ).to.be.rejectedWith(GeneratedSignatureManifestError);
        });

        withGenerated.test('there is no manifest', async ctx => {
            await rm(ctx.resolve('manifest.json'));

            await expect(
                geneverFile('input.json', { ...ctx.options, check: true })
            ).to.be.rejectedWith(Error, 'manifest.json');
        });
    });

    withGenerated.test('records files outside the manifest directory', async ctx => {
        const options = { ...ctx.options, manifest: 'sub/manifest.json' };
        await geneverFile('input.json', options);
        await ctx.server.close();

        expect(
            Object.keys(
                parseManifest(await ctx.read('sub/manifest.json')).files['../input.ts']?.inputs ??
                    {}
            )
        ).to.include('../common.json');
        expect(await geneverFile('input.json', { ...options, check: true })).to.have.property(
            'updated',
            false
        );
    });

    withGenerated.test('--manifest', async ctx => {
        await ctx.server.close();

        const result = await execAsync(
            `./bin.mjs input.json --manifest manifest.json --ci --cwd ${ctx.tmpDir.path}`
        );

        expect(result.stdout).to.equal('');
        expect(await readFile(ctx.resolve('input.ts'), 'utf8')).to.contain('export type Schema');
    });
});
