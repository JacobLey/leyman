import Path from 'node:path';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import * as ParseCwd from 'parse-cwd';

suite('parseCwd', () => {
    test('Defaults to process.cwd()', async () => {
        const cwd = await ParseCwd.parseCwd();
        expect(cwd).to.equal(process.cwd());
    });

    test('Resolves relative to process.cwd()', async () => {
        const cwd = await ParseCwd.parseCwd(Path.relative(process.cwd(), import.meta.dirname));
        expect(cwd).to.equal(import.meta.dirname);
    });

    suite('Allows file path', () => {
        test('As string', async () => {
            const cwd = await ParseCwd.parseCwd(import.meta.url);
            expect(cwd).to.equal(import.meta.dirname);
        });

        test('As URL', async () => {
            const cwd = await ParseCwd.parseCwd(new URL(import.meta.url));
            expect(cwd).to.equal(import.meta.dirname);
        });

        suite('Allows options', () => {
            test('As string', async () => {
                const cwd = await ParseCwd.parseCwd({
                    cwd: import.meta.url,
                });
                expect(cwd).to.equal(import.meta.dirname);
            });

            test('As URL', async () => {
                const cwd = await ParseCwd.parseCwd({
                    cwd: new URL(import.meta.url),
                });
                expect(cwd).to.equal(import.meta.dirname);
            });

            test('As Empty', async () => {
                const cwd = await ParseCwd.parseCwd({});
                expect(cwd).to.equal(process.cwd());
            });
        });

        test('Allows null', async () => {
            const cwd = await ParseCwd.parseCwd(null);
            expect(cwd).to.equal(process.cwd());
        });

        test('Throws on non-found', async () => {
            const thrown: unknown = await expect(
                ParseCwd.parseCwd('/not/found')
            ).to.be.rejectedWith(Error);
            expect(thrown).to.include({
                message: 'Directory not found: /not/found',
            });
            expect(thrown).to.have.nested.property('cause.code', 'ENOENT');
        });

        test('Throws not found under a file', async () => {
            const underFile = Path.join(import.meta.filename, 'child');
            const thrown: unknown = await expect(ParseCwd.parseCwd(underFile)).to.be.rejectedWith(
                Error,
                `Directory not found: ${underFile}`
            );
            expect(thrown).to.have.nested.property('cause.code', 'ENOTDIR');
        });

        test('Rethrows other errors', async () => {
            const tooLong = Path.join(import.meta.dirname, 'a'.repeat(1000));
            const thrown: unknown = await expect(ParseCwd.parseCwd(tooLong)).to.be.rejectedWith(
                Error
            );
            expect(thrown).to.have.property('code', 'ENAMETOOLONG');
        });
    });
});
