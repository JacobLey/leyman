import { writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'chai';
import { afterEach, suite, test } from 'mocha-hookup';
import { patch, patchKey } from 'named-patch';
import { stub, verifyAndRestore } from 'sinon';
import { dedent } from 'ts-dedent';
import { barrelify } from 'barrelify';

const testDir = Path.join(
    fileURLToPath(import.meta.url),
    '../../../../src/tests/data'
);

suite('barrelify', () => {

    afterEach(() => {
        verifyAndRestore();
    });

    test('Noop for pre-barreled files', async () => {

        const written = await barrelify({
            cwd: testDir,
            ignore: ['./wrong/*'],
        });
        expect(written).to.deep.equal([]);
    });

    test('Detects out-of-sync files', async () => {

        const written = await barrelify({
            cwd: testDir,
            dryRun: true,
        });

        const wrongIndex = Path.join(testDir, 'wrong/index.ts');

        expect(written).to.deep.equal([wrongIndex]);
    });

    test('All options are optional', async () => {

        const writeStub = stub(patch(writeFile), patchKey).callsFake(
            async (path, content, encoding) => {
                expect(path).to.equal(Path.join(testDir, 'wrong/index.ts'));
                expect(content).to.equal(dedent`
                    // AUTO-BARREL

                    export * from './wrong.js';\n
                `);
                expect(encoding).to.equal('utf8');
            }
        );

        await barrelify();

        expect(writeStub.callCount).to.equal(1);
    });
});
