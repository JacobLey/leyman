import { writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { expect } from '@leyman/expect';
import { formatText } from 'format-file';
import { verify } from 'generated-signature';
import { beforeEach, suite } from 'mocha-chain';
import { PopulateFilesCheckError, PopulateFilesOwnershipError } from 'populate-files';
import { XeneverLoadError } from 'xenever';
import { generate, loadXsd, xeneverFile } from 'xenever/xsd';
import { createTmpDir } from './lib/fixtures.js';

suite('xeneverFile', () => {
    const withTmpDir = beforeEach(createTmpDir);
    withTmpDir.afterEach(async ctx => {
        await ctx.tmpDir.cleanup();
    });

    withTmpDir.test('writes the formatted output of generate next to the XSD', async ctx => {
        const result = await xeneverFile(ctx.resolve('main.xsd'));

        expect(result).to.deep.equal({ output: ctx.resolve('main.ts'), updated: true });
        expect(await ctx.read('main.ts')).to.equal(
            await formatText(generate(await loadXsd(ctx.resolve('main.xsd'))).text, { ext: '.ts' })
        );
    });

    withTmpDir.test('resolves paths from cwd', async ctx => {
        const result = await xeneverFile('main.xsd', { cwd: ctx.tmpDir.path, output: 'out/x.ts' });

        expect(result.output).to.equal(Path.join(ctx.tmpDir.path, 'out/x.ts'));
    });

    withTmpDir.test('appends .ts to an input without the .xsd extension', async ctx => {
        await ctx.write('schema', await ctx.read('main.xsd'));

        const result = await xeneverFile('schema', { cwd: ctx.tmpDir.path });

        expect(result.output).to.equal(ctx.resolve('schema.ts'));
    });

    withTmpDir.test('passes bigint and ordered to the loader', async ctx => {
        const options = { bigint: true, ordered: ['order'] } as const;

        await xeneverFile(ctx.resolve('main.xsd'), options);

        expect(await ctx.read('main.ts')).to.equal(
            await formatText(generate(await loadXsd(ctx.resolve('main.xsd'), options)).text, {
                ext: '.ts',
            })
        );
    });

    withTmpDir.test('resolves catalog paths from cwd', async ctx => {
        await ctx.edit('main.xsd', 'common.xsd', 'urn:common');
        await ctx.write('schemas/common.xsd', await ctx.read('common.xsd'));

        const result = await xeneverFile('main.xsd', {
            cwd: ctx.tmpDir.path,
            catalog: { 'urn:common': 'schemas/common.xsd' },
        });

        expect(result.updated).to.equal(true);
    });

    withTmpDir.test('fails on a remote location without a catalog entry', async ctx => {
        await ctx.edit('main.xsd', 'common.xsd', 'https://example.test/common.xsd');

        await expect(xeneverFile(ctx.resolve('main.xsd'))).to.be.rejectedWith(XeneverLoadError);
    });

    withTmpDir.test('is not updated when up to date', async ctx => {
        await xeneverFile(ctx.resolve('main.xsd'));

        expect(await xeneverFile(ctx.resolve('main.xsd'))).to.have.property('updated', false);
    });

    withTmpDir.test('check fails when out of date', async ctx => {
        await expect(xeneverFile(ctx.resolve('main.xsd'), { check: true })).to.be.rejectedWith(
            PopulateFilesCheckError
        );
    });

    withTmpDir.test('dryRun does not write', async ctx => {
        const result = await xeneverFile(ctx.resolve('main.xsd'), { dryRun: true });

        expect(result.updated).to.equal(true);
        await expect(ctx.read('main.ts')).to.be.rejectedWith(Error);
    });

    suite('signed', () => {
        withTmpDir.test('writes a signed file', async ctx => {
            await xeneverFile(ctx.resolve('main.xsd'), { signed: true });

            expect(verify(await ctx.read('main.ts'))).to.deep.equal({ status: 'valid' });
        });

        withTmpDir.test('refuses to overwrite an edited file', async ctx => {
            await xeneverFile(ctx.resolve('main.xsd'), { signed: true });
            await writeFile(ctx.resolve('main.ts'), `${await ctx.read('main.ts')}// edit\n`);

            await expect(xeneverFile(ctx.resolve('main.xsd'), { signed: true })).to.be.rejectedWith(
                PopulateFilesOwnershipError
            );
        });

        withTmpDir.test('overwrites an edited file with force', async ctx => {
            await writeFile(ctx.resolve('main.ts'), 'handwritten\n');

            await xeneverFile(ctx.resolve('main.xsd'), { signed: true, force: true });

            expect(verify(await ctx.read('main.ts'))).to.deep.equal({ status: 'valid' });
        });
    });
});
