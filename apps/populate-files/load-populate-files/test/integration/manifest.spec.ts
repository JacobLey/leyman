import { exec } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { promisify } from 'node:util';
import { dir } from 'tmp-promise';
import { expect } from '@leyman/expect';
import { parseManifest } from 'generated-signature';
import { loadAndPopulateFiles } from 'load-populate-files';
import { beforeEach, suite } from 'mocha-chain';

const execAsync = promisify(exec);

suite('Manifest', () => {
    const withDir = beforeEach(async () => {
        const tmpDir = await dir({ prefix: 'load-populate-files-manifest', unsafeCleanup: true });
        const manifestPath = Path.join(tmpDir.path, 'manifest.json');
        const readManifest = async () =>
            Object.keys(parseManifest(await readFile(manifestPath, 'utf8')).files);
        return { tmpDir, manifestPath, readManifest };
    });

    withDir.afterEach(async ctx => {
        await ctx.tmpDir.cleanup();
    });

    withDir.test('Writes the manifest', async ctx => {
        await loadAndPopulateFiles(
            { filePath: './dist-test/data/signed.js' },
            { check: false, targetDir: ctx.tmpDir.path, manifest: ctx.manifestPath }
        );

        expect(await ctx.readManifest()).to.deep.equal(['signed.ts']);
    });

    withDir.test('Writes the manifest with --manifest', async ctx => {
        await execAsync(
            `./bin.mjs --ci=false --target-dir ${ctx.tmpDir.path} --manifest ${ctx.manifestPath} --file-path ./dist-test/data/signed.js`
        );

        expect(await ctx.readManifest()).to.deep.equal(['signed.ts']);
    });

    withDir.test('Fails to --clean without --manifest', async ctx => {
        const stalePath = Path.join(ctx.tmpDir.path, 'stale.txt');
        await writeFile(stalePath, 'mine\n');

        const thrown: unknown = await expect(
            execAsync(
                `./bin.mjs --ci=false --target-dir ${ctx.tmpDir.path} --clean --file-path ./dist-test/data/signed.js`
            )
        ).to.be.rejectedWith(Error);
        expect(thrown)
            .to.have.property('stderr')
            .that.includes('TypeError: `clean` needs a `manifest`');
        expect(await readFile(stalePath, 'utf8')).to.equal('mine\n');
    });

    withDir.test('Removes unlisted files with --unsafe-clean-unlisted', async ctx => {
        const stalePath = Path.join(ctx.tmpDir.path, 'stale.txt');
        await writeFile(stalePath, 'mine\n');

        const results = await loadAndPopulateFiles(
            { filePath: './dist-test/data/signed.js' },
            { check: false, targetDir: ctx.tmpDir.path, clean: true, unsafeCleanUnlisted: true }
        );

        expect(results).to.deep.equal([
            {
                filePath: Path.join(ctx.tmpDir.path, 'signed.ts'),
                reason: 'file-not-exist',
                updated: true,
            },
            { filePath: stalePath, reason: 'stale-file', updated: true },
        ]);
    });

    withDir.test('Only --clean files the --manifest lists', async ctx => {
        const stalePath = Path.join(ctx.tmpDir.path, 'stale.txt');
        await writeFile(stalePath, 'mine\n');

        await execAsync(
            `./bin.mjs --ci=false --target-dir ${ctx.tmpDir.path} --manifest ${ctx.manifestPath} --clean --file-path ./dist-test/data/signed.js`
        );

        expect(await ctx.readManifest()).to.deep.equal(['signed.ts']);
        expect(await readFile(stalePath, 'utf8')).to.equal('mine\n');
    });
});
