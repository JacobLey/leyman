import path from 'node:path';
import { expect } from '@leyman/expect';
import { barrelify } from 'barrelify';
import { suite, test } from 'mocha-chain';

// Compiled to `dist-test/integration/`
const workspaceRoot = path.join(import.meta.dirname, '../../../..');

// `barrelify` depends on these, so they can't depend on it for a `barrelify` target of their own
const packagesInBarrelifysDependencies = ['format-file', 'haywire', 'unknown-error'];

suite('barrels of the packages barrelify depends on', () => {
    for (const name of packagesInBarrelifysDependencies) {
        test(`${name} is up to date`, async () => {
            const outdated = await barrelify({
                cwd: path.join(workspaceRoot, 'tools', name),
                dryRun: true,
            });

            expect(outdated).to.deep.equal([]);
        });
    }
});
