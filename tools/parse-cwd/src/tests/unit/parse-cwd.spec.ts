import Path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { suite, test } from 'mocha-hookup';
import * as ParseCwd from 'parse-cwd';

use(chaiAsPromised);

suite('parseCwd', () => {
    
    test('Defaults to process.cwd()', async () => {

        const cwd = await ParseCwd.parseCwd();
        expect(cwd).to.equal(process.cwd());
    });

    test('Resolves relative to process.cwd()', async () => {

        const cwd = await ParseCwd.parseCwd(Path.relative(
            process.cwd(),
            Path.dirname(fileURLToPath(import.meta.url))
        ));
        expect(cwd).to.equal(
            Path.dirname(fileURLToPath(import.meta.url))
        );
    });

    suite('Allows file path', () => {

        test('As string', async () => {

            const cwd = await ParseCwd.parseCwd(import.meta.url);
            expect(cwd).to.equal(
                Path.dirname(fileURLToPath(import.meta.url))
            );
        });

        test('As URL', async () => {

            const cwd = await ParseCwd.parseCwd(new URL(import.meta.url));
            expect(cwd).to.equal(
                Path.dirname(fileURLToPath(import.meta.url))
            );
        });

        suite('Allows options', () => {

            test('As string', async () => {

                const cwd = await ParseCwd.parseCwd({
                    cwd: import.meta.url,
                });
                expect(cwd).to.equal(
                    Path.dirname(fileURLToPath(import.meta.url))
                );
            });

            test('As URL', async () => {

                const cwd = await ParseCwd.parseCwd({
                    cwd: new URL(import.meta.url),
                });
                expect(cwd).to.equal(
                    Path.dirname(fileURLToPath(import.meta.url))
                );
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

            await expect(ParseCwd.parseCwd('/not/found')).eventually.be.rejectedWith(Error).that.contain({
                message: 'Directory not found: /not/found',
            });
        });
    });
});
