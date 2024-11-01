import Path from 'node:path';
import { fileURLToPath } from 'node:url';
import { barrelify } from 'barrelify';
import { suite, test } from 'mocha-chain';
import { expect } from '../chai-hooks.js';

const rootDir = Path.join(fileURLToPath(import.meta.url), '../../../..');

suite('barrelify', () => {
    test('success', async () => {
        expect(
            await barrelify({
                cwd: rootDir,
                dryRun: true,
                ignore: ['foo'],
            })
        ).to.deep.equal([Path.join(rootDir, 'src/tests/data/wrong/index.ts')]);
    });

    test('Ignore out of sync', async () => {
        expect(
            await barrelify({
                cwd: './bin.mjs',
                ignore: ['**/wrong/*'],
            })
        ).to.deep.equal([]);
    });
});
