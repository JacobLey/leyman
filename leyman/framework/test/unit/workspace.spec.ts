import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import Os from 'node:os';
import Path from 'node:path';
import { expect } from '@leyman/expect';
import { afterEach, suite, test } from 'mocha-chain';
import { parseJsonc, readWorkspace } from '#internal/lib/workspace.js';

suite('workspace', () => {
    test('Parses JSON with comments and trailing commas', () => {
        expect(
            parseJsonc(`{
    // A comment
    "a": "// not a comment, \\"quoted\\"", /* another */
    "b": [1, 2,],
}`)
        ).to.deep.equal({ a: '// not a comment, "quoted"', b: [1, 2] });
    });

    suite('linkTarget', () => {
        let root = '';

        afterEach(async () => {
            await rm(root, { recursive: true, force: true });
        });

        test('Fails on a path it cannot check', async () => {
            root = await mkdtemp(Path.join(Os.tmpdir(), 'framework-workspace-'));
            await writeFile(Path.join(root, 'package.json'), '{}');
            await mkdir(Path.join(root, 'dir'));
            await writeFile(Path.join(root, 'file'), '');
            const workspace = await readWorkspace(root);

            expect(await workspace.linkTarget('dir')).to.equal(undefined);
            await expect(workspace.linkTarget('file/below')).to.eventually.be.rejectedWith(
                /ENOTDIR/v
            );
        });
    });
});
