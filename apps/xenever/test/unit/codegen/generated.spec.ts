import { readFile, writeFile } from 'node:fs/promises';
import { expect } from '@leyman/expect';
import { formatText } from 'format-file';
import { suite, test } from 'mocha-chain';
import { generate, loadXsd } from 'xenever/xsd';
import { codegenFixtures } from './fixtures.js';

/**
 * Reads a file, if it exists.
 *
 * @param path - path of the file
 * @returns its text, or `null` when there is none
 */
const readIfExists = async (path: string): Promise<string | null> => {
    try {
        return await readFile(path, 'utf8');
    } catch {
        return null;
    }
};

suite('Generated fixtures', () => {
    for (const { name, xsd, options } of codegenFixtures) {
        // The committed output is what the test type check reads, so a stale one would check the wrong code. A
        // test that finds it stale rewrites it and fails: rerun the tests to check the new output.
        test(`test/generated/${name}.ts is up to date`, async () => {
            const path = `test/generated/${name}.ts`;
            const generated = await formatText(generate(await loadXsd(xsd, options)).text, {
                ext: '.ts',
            });
            const committed = await readIfExists(path);
            if (committed !== generated) {
                await writeFile(path, generated);
            }
            expect(committed, `${path} was stale, and is rewritten`).to.equal(generated);
        });
    }

    test('Generates the same text every time', async () => {
        const [fixture] = codegenFixtures;
        const texts = await Promise.all(
            [1, 2].map(async () => generate(await loadXsd(fixture!.xsd, fixture!.options)).text)
        );
        expect(texts[0]).to.equal(texts[1]);
    });
});
