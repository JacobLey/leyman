import { expect } from '@leyman/expect';
import { parseManifest } from 'generated-signature';
import { beforeEach, suite } from 'mocha-chain';
import { PopulateFilesCheckError } from 'populate-files';
import { xeneverFile } from 'xenever/xsd';
import { createTmpDir } from './lib/fixtures.js';

suite('manifest', () => {
    const withGenerated = beforeEach(async () => {
        const ctx = await createTmpDir();
        const options = { manifest: 'manifest.json', cwd: ctx.tmpDir.path } as const;
        await xeneverFile('main.xsd', options);
        return { ...ctx, options };
    });
    withGenerated.afterEach(async ctx => {
        await ctx.tmpDir.cleanup();
    });

    withGenerated.test('records the output, and every XSD read', async ctx => {
        const { files } = parseManifest(await ctx.read('manifest.json'));

        expect(Object.keys(files['main.ts']?.inputs ?? {})).to.have.members([
            './main.xsd',
            './common.xsd',
            'generator',
            'options',
        ]);
    });

    withGenerated.test('records XSDs outside the manifest directory', async ctx => {
        await xeneverFile('main.xsd', { ...ctx.options, manifest: 'sub/manifest.json' });

        const { files } = parseManifest(await ctx.read('sub/manifest.json'));
        expect(Object.keys(files['../main.ts']?.inputs ?? {})).to.include('../common.xsd');
    });

    withGenerated.test('records a change of the options', async ctx => {
        const before = parseManifest(await ctx.read('manifest.json')).files['main.ts']?.inputs;

        await xeneverFile('main.xsd', { ...ctx.options, bigint: true });

        const after = parseManifest(await ctx.read('manifest.json')).files['main.ts']?.inputs;
        expect(after?.options).not.to.equal(before?.options);
    });

    withGenerated.test('check passes when nothing changed', async ctx => {
        expect(await xeneverFile('main.xsd', { ...ctx.options, check: true })).to.have.property(
            'updated',
            false
        );
    });

    withGenerated.test('check fails when an included XSD changed', async ctx => {
        await ctx.edit('common.xsd', 'xs:token', 'xs:string');

        await expect(xeneverFile('main.xsd', { ...ctx.options, check: true })).to.be.rejectedWith(
            PopulateFilesCheckError
        );
    });
});
