import Path from 'node:path';
import { loadAndPopulateFiles } from 'load-populate-files';
import { suite, test } from 'mocha-chain';

suite('file-content', () => {
    test('Is in sync', async () => {
        await loadAndPopulateFiles(
            {
                filePath: './dist/file-content.js',
            },
            {
                cwd: Path.resolve(import.meta.dirname, '../../..'),
                targetDir: './out',
                check: true,
                dryRun: true,
            }
        );
    });
});
