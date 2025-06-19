import Path from 'node:path';
import { loadAndPopulateFiles } from 'npm-load-populate-files';
import { suite, test } from 'mocha-chain';

suite('FileContent', () => {
    test('Files are populated', async () => {
        await loadAndPopulateFiles(
            {
                filePath: Path.join(import.meta.filename, '../../../file-content.js'),
            },
            {
                check: true,
                cwd: Path.join(import.meta.filename, '../../../..'),
            }
        );
    });
});
