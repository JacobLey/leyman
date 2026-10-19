import { readFile, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { dir } from 'tmp-promise';
import { expect } from '@leyman/expect';
import { verify } from 'generated-signature';
import { beforeEach, suite } from 'mocha-chain';
import { populateFile, populateFiles, PopulateFilesOwnershipError } from 'populate-files';

const generate = (value: number, section = 'custom'): string =>
    [
        `export const generated = ${value};`,
        `// @manual-start ${section}`,
        'export const custom = 1;',
        `// @manual-end ${section}`,
        '',
    ].join('\n');

suite('Signed files', () => {
    const withFile = beforeEach(async () => {
        const tmpDir = await dir({ prefix: 'populate-file-signed', unsafeCleanup: true });
        const filePath = Path.join(tmpDir.path, 'generated.ts');
        await populateFile({ filePath, content: generate(1), signed: true }, { check: false });
        return { tmpDir, filePath };
    });

    withFile.afterEach(async ctx => {
        await ctx.tmpDir.cleanup();
    });

    const editFile = async (filePath: string, from: string, to: string): Promise<void> => {
        const text = await readFile(filePath, 'utf8');
        await writeFile(
            filePath,
            text.replace(from, () => to)
        );
    };

    withFile.test('Writes a signed file', async ctx => {
        expect(verify(await readFile(ctx.filePath, 'utf8'))).to.deep.equal({ status: 'valid' });
    });

    withFile.test('Skips an up to date file', async ctx => {
        expect(
            await populateFile(
                { filePath: ctx.filePath, content: generate(1), signed: true },
                { check: true }
            )
        ).to.deep.equal({ filePath: ctx.filePath, updated: false });
    });

    withFile.test('Passes check when only a manual section was edited', async ctx => {
        await editFile(ctx.filePath, 'custom = 1', 'custom = 2');
        expect(
            await populateFile(
                { filePath: ctx.filePath, content: generate(1), signed: true },
                { check: true }
            )
        ).to.deep.equal({ filePath: ctx.filePath, updated: false });
    });

    withFile.test('Keeps manual sections when regenerating', async ctx => {
        await editFile(ctx.filePath, 'custom = 1', 'custom = 2');
        await populateFile(
            { filePath: ctx.filePath, content: generate(2), signed: true },
            { check: false }
        );
        const data = await readFile(ctx.filePath, 'utf8');
        expect(data).to.include('generated = 2').and.include('custom = 2');
        expect(verify(data)).to.deep.equal({ status: 'valid' });
    });

    withFile.test('Refuses to overwrite an edited file', async ctx => {
        await editFile(ctx.filePath, 'generated = 1', 'generated = 3');
        await expect(
            populateFile(
                { filePath: ctx.filePath, content: generate(2), signed: true },
                { check: false }
            )
        )
            .to.be.rejectedWith(PopulateFilesOwnershipError)
            .and.eventually.include({ reason: 'edited', filePath: ctx.filePath });
    });

    withFile.test('Refuses to overwrite an unsigned file', async ctx => {
        await writeFile(ctx.filePath, 'handwritten\n');
        await expect(
            populateFile(
                { filePath: ctx.filePath, content: generate(1), signed: true },
                { check: false }
            )
        )
            .to.be.rejectedWith(PopulateFilesOwnershipError)
            .and.eventually.include({ reason: 'not-owned' });
    });

    withFile.test('Refuses to overwrite a malformed file', async ctx => {
        await editFile(ctx.filePath, '// @manual-end custom\n', '');
        await expect(
            populateFile(
                { filePath: ctx.filePath, content: generate(1), signed: true },
                { check: false }
            )
        )
            .to.be.rejectedWith(PopulateFilesOwnershipError)
            .and.eventually.include({ reason: 'malformed' });
    });

    withFile.test('Refuses to drop an edited section', async ctx => {
        await expect(
            populateFile(
                { filePath: ctx.filePath, content: generate(1, 'renamed'), signed: true },
                { check: false }
            )
        )
            .to.be.rejectedWith(PopulateFilesOwnershipError)
            .and.eventually.include({ reason: 'orphaned-section' });
    });

    withFile.test('Does not write when refusing', async ctx => {
        await editFile(ctx.filePath, 'generated = 1', 'generated = 3');
        await expect(
            populateFile(
                { filePath: ctx.filePath, content: generate(2), signed: true },
                { check: false }
            )
        ).to.be.rejectedWith(PopulateFilesOwnershipError);
        expect(await readFile(ctx.filePath, 'utf8')).to.include('generated = 3');
    });

    suite('force', () => {
        withFile.test('Overwrites an edited file, keeping manual sections', async ctx => {
            await editFile(ctx.filePath, 'generated = 1', 'generated = 3');
            await editFile(ctx.filePath, 'custom = 1', 'custom = 2');
            await populateFile(
                { filePath: ctx.filePath, content: generate(1), signed: true },
                { check: false, force: true }
            );
            const data = await readFile(ctx.filePath, 'utf8');
            expect(data).to.include('generated = 1').and.include('custom = 2');
            expect(verify(data)).to.deep.equal({ status: 'valid' });
        });

        withFile.test('Overwrites a malformed file', async ctx => {
            await editFile(ctx.filePath, '// @manual-end custom\n', '');
            await populateFile(
                { filePath: ctx.filePath, content: generate(1), signed: true },
                { check: false, force: true }
            );
            expect(verify(await readFile(ctx.filePath, 'utf8'))).to.deep.equal({
                status: 'valid',
            });
        });

        withFile.test('Drops orphaned sections', async ctx => {
            await populateFile(
                { filePath: ctx.filePath, content: generate(1, 'renamed'), signed: true },
                { check: false, force: true }
            );
            expect(await readFile(ctx.filePath, 'utf8')).to.include('@manual-start renamed');
        });

        withFile.test('Is passed through populateFiles', async ctx => {
            await editFile(ctx.filePath, 'generated = 1', 'generated = 3');
            expect(
                await populateFiles(
                    [{ filePath: ctx.filePath, content: generate(1), signed: true }],
                    { check: false, force: true }
                )
            ).to.deep.equal([{ filePath: ctx.filePath, updated: true, reason: 'content-changed' }]);
        });
    });

    withFile.test('Requires string content', async ctx => {
        await expect(
            populateFile(
                // @ts-expect-error signed content must be a string
                { filePath: ctx.filePath, content: { foo: 1 }, signed: true },
                { check: false }
            )
        ).to.be.rejectedWith(TypeError);
    });
});
