import { exec } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { promisify } from 'node:util';
import { dir } from 'tmp-promise';
import { expect } from '@leyman/expect';
import { verify } from 'generated-signature';
import { loadAndPopulateFiles } from 'load-populate-files';
import { beforeEach, suite } from 'mocha-chain';
import { PopulateFilesOwnershipError } from 'populate-files';

const execAsync = promisify(exec);

suite('Signed files', () => {
    const withEditedFile = beforeEach(async () => {
        const tmpDir = await dir({ prefix: 'load-populate-files-signed', unsafeCleanup: true });
        const filePath = Path.join(tmpDir.path, 'signed.ts');
        await loadAndPopulateFiles(
            { filePath: './dist-test/data/signed.js' },
            { check: false, targetDir: tmpDir.path }
        );
        const text = await readFile(filePath, 'utf8');
        await writeFile(filePath, text.replace('= 1', '= 2'));
        return { tmpDir, filePath };
    });

    withEditedFile.afterEach(async ctx => {
        await ctx.tmpDir.cleanup();
    });

    withEditedFile.test('Refuses to overwrite an edited file', async ctx => {
        await expect(
            loadAndPopulateFiles(
                { filePath: './dist-test/data/signed.js' },
                { check: false, targetDir: ctx.tmpDir.path }
            )
        ).to.be.rejectedWith(PopulateFilesOwnershipError);
    });

    withEditedFile.test('Overwrites with force', async ctx => {
        await loadAndPopulateFiles(
            { filePath: './dist-test/data/signed.js' },
            { check: false, force: true, targetDir: ctx.tmpDir.path }
        );
        expect(verify(await readFile(ctx.filePath, 'utf8'))).to.deep.equal({ status: 'valid' });
    });

    withEditedFile.test('Overwrites with --force', async ctx => {
        await execAsync(
            `./bin.mjs --ci=false --force --target-dir ${ctx.tmpDir.path} --file-path ./dist-test/data/signed.js`
        );
        expect(verify(await readFile(ctx.filePath, 'utf8'))).to.deep.equal({ status: 'valid' });
    });
});
