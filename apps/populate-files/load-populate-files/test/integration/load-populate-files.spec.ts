import Path from 'node:path';
import { expect } from '@leyman/expect';
import { loadAndPopulateFiles } from 'load-populate-files';
import { suite, test } from 'mocha-chain';

suite('loadAndPopulateFiles', () => {
    test('success', async () => {
        const result = await loadAndPopulateFiles(
            {
                filePath: './data/in-sync.js',
            },
            {
                check: true,
                cwd: './dist-test',
            }
        );

        expect(result).to.deep.equal([
            {
                filePath: Path.join(import.meta.dirname, '../../test/data/in-sync.json'),
                updated: false,
            },
        ]);
    });

    test('ci', async () => {
        const thrown: unknown = await expect(
            loadAndPopulateFiles(
                {
                    filePath: './dist-test/data/out-of-sync.js',
                },
                {
                    check: true,
                }
            )
        ).to.be.rejectedWith(Error);
        expect(thrown)
            .to.have.property('message')
            .that.includes(
                `File ${Path.join(import.meta.dirname, '../../test/data/out-of-sync.txt')} not up to date. Reason: content-changed`
            );
    });

    test('dry run', async () => {
        const result = await loadAndPopulateFiles(
            {
                filePath: './dist-test/data/not-populated.js',
            },
            {
                check: false,
                dryRun: true,
            }
        );

        expect(result).to.deep.equal([
            {
                filePath: Path.join(import.meta.dirname, '../../test/data/in-sync.json'),
                updated: false,
            },
            {
                filePath: Path.join(import.meta.dirname, '../../test/data/does-not-exist.json'),
                reason: 'file-not-exist',
                updated: true,
            },
        ]);
    });

    suite('failure', () => {
        test('Not found', async () => {
            const thrown: unknown = await expect(
                loadAndPopulateFiles(
                    {
                        filePath: './dist-test/data/does-not-exist.js',
                    },
                    {
                        check: false,
                    }
                )
            ).to.be.rejectedWith(Error);
            expect(thrown)
                .to.have.property('message')
                .that.includes(
                    `JS file not found: ${Path.resolve('./dist-test/data/does-not-exist.js')}`
                );
        });

        test('File fails to load', async () => {
            const thrown: unknown = await expect(
                loadAndPopulateFiles(
                    {
                        filePath: './dist-test/data/throws-error.js',
                    },
                    {
                        check: false,
                    }
                )
            ).to.be.rejectedWith(Error);
            expect(thrown).to.have.property('message').that.includes("Can't load me!");
        });

        test('Invalid export syntax', async () => {
            const thrown: unknown = await expect(
                loadAndPopulateFiles(
                    {
                        filePath: './dist-test/data/invalid-export.js',
                    },
                    {
                        check: false,
                    }
                )
            ).to.be.rejectedWith(Error);
            expect(thrown)
                .to.have.property('message')
                .that.includes(
                    `File content does not fulfill populate-file input at: ${Path.resolve('./dist-test/data/invalid-export.js')}`
                );
        });
    });
});
