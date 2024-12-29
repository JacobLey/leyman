import Path from 'node:path';
import { loadAndPopulateFiles } from 'load-populate-files';
import { suite, test } from 'mocha-chain';
import { expect } from '../chai-hooks.js';

suite('loadAndPopulateFiles', () => {
    test('success', async () => {
        const result = await loadAndPopulateFiles(
            {
                filePath: './data/in-sync.js',
            },
            {
                check: true,
                cwd: './dist/tests',
            }
        );

        expect(result).to.deep.equal([
            {
                filePath: Path.join(import.meta.dirname, '../../../src/tests/data/in-sync.json'),
                updated: false,
            },
        ]);
    });

    test('ci', async () => {
        await expect(
            loadAndPopulateFiles(
                {
                    filePath: './dist/tests/data/out-of-sync.js',
                },
                {
                    check: true,
                }
            )
        ).to.eventually.be.rejectedWith(
            Error,
            `File ${Path.join(import.meta.dirname, '../../../src/tests/data/out-of-sync.txt')} not up to date. Reason: content-changed`
        );
    });

    test('dry run', async () => {
        const result = await loadAndPopulateFiles(
            {
                filePath: './dist/tests/data/not-populated.js',
            },
            {
                check: false,
                dryRun: true,
            }
        );

        expect(result).to.deep.equal([
            {
                filePath: Path.join(import.meta.dirname, '../../../src/tests/data/in-sync.json'),
                updated: false,
            },
            {
                filePath: Path.join(
                    import.meta.dirname,
                    '../../../src/tests/data/does-not-exist.json'
                ),
                reason: 'file-not-exist',
                updated: true,
            },
        ]);
    });

    suite('failure', () => {
        test('Not found', async () => {
            await expect(
                loadAndPopulateFiles(
                    {
                        filePath: './dist/tests/data/does-not-exist.js',
                    },
                    {
                        check: false,
                    }
                )
            ).to.eventually.be.rejectedWith(
                Error,
                `JS file not found: ${Path.resolve('./dist/tests/data/does-not-exist.js')}`
            );
        });

        test('File fails to load', async () => {
            await expect(
                loadAndPopulateFiles(
                    {
                        filePath: './dist/tests/data/throws-error.js',
                    },
                    {
                        check: false,
                    }
                )
            ).to.eventually.be.rejectedWith(Error, "Can't load me!");
        });

        test('Invalid export syntax', async () => {
            await expect(
                loadAndPopulateFiles(
                    {
                        filePath: './dist/tests/data/invalid-export.js',
                    },
                    {
                        check: false,
                    }
                )
            ).to.eventually.be.rejectedWith(
                Error,
                `File content does not fulfill populate-file input at: ${Path.resolve('./dist/tests/data/invalid-export.js')}`
            );
        });
    });
});
