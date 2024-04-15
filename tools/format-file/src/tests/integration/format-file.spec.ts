import { readFile, writeFile } from 'node:fs/promises';
import Path from 'node:path';
import { expect } from 'chai';
import { dir } from 'tmp-promise';
import * as BiomeFormatter from 'format-file';
import { beforeEach, suite } from 'mocha-hookup';
import formattedFixtures from './fixtures/formatted.js';

suite('format-file', () => {
    const withTmpFile = beforeEach(async () => {
        const tmpDir = await dir({ unsafeCleanup: true });
        return {
            tmpDir,
        };
    });

    withTmpFile.afterEach(async ({ tmpDir }) => {
        await tmpDir.cleanup();
    });

    withTmpFile.test('Formats files', async ({ tmpDir }) => {
        const jsonFileName = 'formatted.json';
        const tsFileName = 'formatted.ts';
        const jsFileName = 'formatted.js';
        await Promise.all([
            writeFile(Path.join(tmpDir.path, jsonFileName), formattedFixtures.json.raw, 'utf8'),
            writeFile(Path.join(tmpDir.path, tsFileName), formattedFixtures.ts.raw, 'utf8'),
            writeFile(Path.join(tmpDir.path, jsFileName), formattedFixtures.js.raw, 'utf8'),
        ]);

        await BiomeFormatter.formatFiles([
            Path.join(tmpDir.path, jsonFileName),
            Path.join(tmpDir.path, tsFileName),
            Path.join(tmpDir.path, jsFileName),
        ]);

        const [jsonFile, tsFile, jsFile] = await Promise.all([
            readFile(Path.join(tmpDir.path, jsonFileName), 'utf8'),
            readFile(Path.join(tmpDir.path, tsFileName), 'utf8'),
            readFile(Path.join(tmpDir.path, jsFileName), 'utf8'),
        ]);

        expect(jsonFile).to.equal(formattedFixtures.json.formatted);
        expect(tsFile).to.equal(formattedFixtures.ts.formatted);
        expect(jsFile).to.equal(formattedFixtures.js.formatted);
    });

    withTmpFile.test('Formats a single file', async ({ tmpDir }) => {
        const jsonFileName = 'formatted.json';
        await writeFile(Path.join(tmpDir.path, jsonFileName), formattedFixtures.json.raw, 'utf8');

        await BiomeFormatter.formatFile(Path.join(tmpDir.path, jsonFileName));

        const jsonFile = await readFile(Path.join(tmpDir.path, jsonFileName), 'utf8');

        expect(jsonFile).to.equal(formattedFixtures.json.formatted);
    });

    withTmpFile.test('Formats a string', async () => {
        const formattedJson = await BiomeFormatter.formatText(formattedFixtures.json.raw, {
            ext: '.json',
        });
        expect(formattedJson).to.equal(formattedFixtures.json.formatted);

        const formattedJs = await BiomeFormatter.formatText(formattedFixtures.js.raw);
        expect(formattedJs).to.equal(formattedFixtures.js.formatted);
    });
});
