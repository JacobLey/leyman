import { access, readFile, rm, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { dir } from 'tmp-promise';
import { expect } from '@leyman/expect';
import { contentHash, GeneratedSignatureManifestError, parseManifest } from 'generated-signature';
import { beforeEach, suite } from 'mocha-chain';
import { populateFile, populateFiles, PopulateFilesOwnershipError } from 'populate-files';

const isFile = async (filePath: string): Promise<boolean> => {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
};

suite('Manifest', () => {
    const withDir = beforeEach(async () => {
        const tmpDir = await dir({ prefix: 'populate-files-manifest', unsafeCleanup: true });
        const resolve = (path: string): string => Path.join(tmpDir.path, path);
        const options = {
            check: false,
            cwd: tmpDir.path,
            targetDir: 'out',
            manifest: 'manifest.json',
        } as const;
        const readManifest = async () =>
            parseManifest(await readFile(resolve('manifest.json'), 'utf8')).files;
        return { tmpDir, resolve, options, readManifest };
    });

    withDir.afterEach(async ctx => {
        await ctx.tmpDir.cleanup();
    });

    const files = [
        { filePath: 'a.json', content: { a: 1 } },
        { filePath: 'b.ts', content: 'export const b = 1;\n', signed: true },
    ] as const;

    withDir.test('Lists every file, relative to the manifest', async ctx => {
        await populateFiles([...files], ctx.options);

        expect(await ctx.readManifest()).to.deep.equal({
            'out/a.json': { hash: contentHash(await readFile(ctx.resolve('out/a.json'))) },
            'out/b.ts': { signature: 'inline' },
        });
    });

    withDir.test('Records inputs', async ctx => {
        await populateFiles(
            [{ filePath: 'a.json', content: {}, manifestInputs: { generator: 'x@1' } }],
            ctx.options
        );

        expect(await ctx.readManifest()).to.have.deep.nested.property(
            String.raw`out/a\.json.inputs`,
            {
                generator: 'x@1',
            }
        );
    });

    withDir.test('Reports the manifest as written', async ctx => {
        const results = await populateFiles([...files], ctx.options);

        expect(results.map(result => result.filePath)).to.include(ctx.resolve('manifest.json'));
    });

    withDir.test('Nothing changes on a second run', async ctx => {
        await populateFiles([...files], ctx.options);

        const results = await populateFiles([...files], { ...ctx.options, check: true });

        expect(results.every(result => !result.updated)).to.equal(true);
    });

    withDir.test('Check fails when only the manifest would change', async ctx => {
        await populateFiles([...files], ctx.options);

        await expect(
            populateFiles([{ ...files[0], manifestInputs: { generator: 'x@2' } }, files[1]], {
                ...ctx.options,
                check: true,
            })
        ).to.be.rejectedWith(Error, 'manifest.json');
    });

    withDir.test('Dry run does not write the manifest', async ctx => {
        await populateFiles([...files], { ...ctx.options, dryRun: true });

        expect(await isFile(ctx.resolve('manifest.json'))).to.equal(false);
    });

    withDir.test('Rejects an invalid manifest', async ctx => {
        await writeFile(ctx.resolve('manifest.json'), '{}');

        await expect(populateFiles([...files], ctx.options)).to.be.rejectedWith(
            GeneratedSignatureManifestError
        );
    });

    suite('Ownership', () => {
        withDir.test('Refuses to overwrite an edited file', async ctx => {
            await populateFiles([...files], ctx.options);
            await writeFile(ctx.resolve('out/a.json'), '{"edited": true}\n');

            await expect(populateFiles([...files], ctx.options))
                .to.be.rejectedWith(PopulateFilesOwnershipError)
                .and.eventually.include({ reason: 'edited' });
        });

        withDir.test('Refuses to overwrite a file it did not write', async ctx => {
            await populateFiles([files[1]], ctx.options);
            await writeFile(ctx.resolve('out/a.json'), '{"handwritten": true}\n');

            await expect(populateFiles([...files], ctx.options))
                .to.be.rejectedWith(PopulateFilesOwnershipError)
                .and.eventually.include({ reason: 'not-owned' });
        });

        withDir.test('Adopts an unlisted file that is already up to date', async ctx => {
            await populateFiles([...files], { ...ctx.options, manifest: null });

            await populateFiles([...files], ctx.options);

            expect(await ctx.readManifest()).to.have.property('out/a.json');
        });

        withDir.test('Overwrites an edited file with force', async ctx => {
            await populateFiles([...files], ctx.options);
            await writeFile(ctx.resolve('out/a.json'), '{"edited": true}\n');

            await populateFiles([...files], { ...ctx.options, force: true });

            expect(JSON.parse(await readFile(ctx.resolve('out/a.json'), 'utf8'))).to.deep.equal({
                a: 1,
            });
        });
    });

    suite('clean', () => {
        const cleanOptions = (ctx: { options: object }) => ({ ...ctx.options, clean: true });

        withDir.test('Removes files the manifest lists that are no longer written', async ctx => {
            await populateFiles([...files], ctx.options);

            await populateFiles([files[1]], cleanOptions(ctx));

            expect(await isFile(ctx.resolve('out/a.json'))).to.equal(false);
            expect(await ctx.readManifest()).to.not.have.property('out/a.json');
        });

        withDir.test('Keeps files the manifest does not list', async ctx => {
            await populateFiles([...files], ctx.options);
            await writeFile(ctx.resolve('out/other.txt'), 'mine');

            await populateFiles([...files], cleanOptions(ctx));

            expect(await isFile(ctx.resolve('out/other.txt'))).to.equal(true);
        });

        withDir.test('Keeps a manifest inside the target directory', async ctx => {
            const options = { ...cleanOptions(ctx), manifest: 'out/manifest.json' };
            await populateFiles([...files], options);

            await populateFiles([...files], options);

            expect(await isFile(ctx.resolve('out/manifest.json'))).to.equal(true);
        });

        withDir.test('Ignores listed files that are already gone', async ctx => {
            await populateFiles([...files], ctx.options);
            await rm(ctx.resolve('out/a.json'));

            const results = await populateFiles([files[1]], cleanOptions(ctx));

            expect(results.map(result => result.filePath)).to.not.include(
                ctx.resolve('out/a.json')
            );
        });

        withDir.test('Refuses to remove an edited file', async ctx => {
            await populateFiles([...files], ctx.options);
            await writeFile(ctx.resolve('out/a.json'), '{"edited": true}\n');

            await expect(populateFiles([files[1]], cleanOptions(ctx)))
                .to.be.rejectedWith(PopulateFilesOwnershipError)
                .and.eventually.include({ reason: 'edited' });
        });

        withDir.test('Removes an edited file with force', async ctx => {
            await populateFiles([...files], ctx.options);
            await writeFile(ctx.resolve('out/a.json'), '{"edited": true}\n');

            await populateFiles([files[1]], { ...cleanOptions(ctx), force: true });

            expect(await isFile(ctx.resolve('out/a.json'))).to.equal(false);
        });

        withDir.test('Check fails on a stale file', async ctx => {
            await populateFiles([...files], ctx.options);

            await expect(
                populateFiles([files[1]], { ...cleanOptions(ctx), check: true })
            ).to.be.rejectedWith(Error, 'stale-file');
        });
    });

    suite('populateFile', () => {
        withDir.test('Keeps the entries of other files', async ctx => {
            await populateFile(files[0], ctx.options);
            await populateFile(files[1], ctx.options);

            expect(Object.keys(await ctx.readManifest())).to.deep.equal(['out/a.json', 'out/b.ts']);
        });

        withDir.test('Checks ownership', async ctx => {
            await populateFile(files[0], ctx.options);
            await writeFile(ctx.resolve('out/a.json'), '{"edited": true}\n');

            await expect(populateFile(files[0], ctx.options)).to.be.rejectedWith(
                PopulateFilesOwnershipError
            );
        });

        withDir.test('Check fails when the manifest would change', async ctx => {
            await populateFile(files[0], { ...ctx.options, manifest: null });

            await expect(
                populateFile(files[0], { ...ctx.options, check: true })
            ).to.be.rejectedWith(Error, 'manifest.json');
        });
    });
});
