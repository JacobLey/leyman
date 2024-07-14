import Path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAndPopulateFiles } from 'load-populate-files';
import { suite, test } from 'mocha-hookup';

const filePath = fileURLToPath(import.meta.url);

suite('FileContent', () => {
    test('Files are populated', async () => {
        await loadAndPopulateFiles(
            {
                filePath: Path.join(filePath, '../../../file-content.js'),
            },
            {
                check: true,
                cwd: Path.join(filePath, '../../../..'),
            }
        );
    });
});
