import { writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { dir } from 'tmp-promise';
import { expect } from '@leyman/expect';
import { loadAndPopulateFiles } from 'load-populate-files';
import { beforeEach, suite } from 'mocha-chain';

suite('Loader', () => {
    const withDir = beforeEach(async () => {
        const tmpDir = await dir({ prefix: 'load-populate-files-loader', unsafeCleanup: true });
        return { tmpDir };
    });

    withDir.afterEach(async ctx => {
        await ctx.tmpDir.cleanup();
    });

    withDir.test('Loads a path with URL-special characters', async ctx => {
        // `#` starts a URL fragment and `%20` a percent escape, so the path only loads as a file URL
        const filePath = Path.join(ctx.tmpDir.path, 'config #1 %20.mjs');
        await writeFile(
            filePath,
            `export default ${JSON.stringify({ filePath: 'out.txt', content: 'hello' })};`
        );

        const result = await loadAndPopulateFiles(
            { filePath },
            { check: false, dryRun: true, targetDir: ctx.tmpDir.path }
        );

        expect(result).to.deep.equal([
            {
                filePath: Path.join(ctx.tmpDir.path, 'out.txt'),
                reason: 'file-not-exist',
                updated: true,
            },
        ]);
    });

    withDir.test('Reports a missing import of an existing file as itself', async ctx => {
        const filePath = Path.join(ctx.tmpDir.path, 'config.mjs');
        await writeFile(filePath, `export { default } from 'populate-files-missing-package';`);

        const thrown: unknown = await expect(
            loadAndPopulateFiles({ filePath }, { check: false, dryRun: true })
        ).to.be.rejectedWith(Error);
        expect(thrown).to.have.property('code', 'ERR_MODULE_NOT_FOUND');
        expect(thrown)
            .to.have.property('message')
            .that.includes("Cannot find package 'populate-files-missing-package'");
    });
});
