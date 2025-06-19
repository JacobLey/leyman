import Path from 'node:path';
import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { suite, test } from 'mocha-chain';
import * as ParseCwd from 'parse-cwd';

use(chaiAsPromised);

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
            await expect(ParseCwd.parseCwd('/not/found'))
                .eventually.be.rejectedWith(Error)
                .that.contain({
                    message: 'Directory not found: /not/found',
                });
        });
    });
});
