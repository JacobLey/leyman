import { readFile } from 'node:fs/promises';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { vectors } from '#test/helpers/vectors.js';

suite('Spec version', () => {
    test('Test vectors are of the version in SPEC.md', async () => {
        const spec = await readFile(new URL('../../../SPEC.md', import.meta.url), 'utf8');
        const version = /^Version (?<version>\d+\.\d+)$/mv.exec(spec)?.groups?.version;
        expect(version).to.equal(vectors.specVersion);
    });
});
