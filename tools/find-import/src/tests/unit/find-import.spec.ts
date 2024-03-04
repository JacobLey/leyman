import Path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';
import { before, suite, test } from 'mocha-hookup';
import * as FindImport from 'find-import';

suite('findImport', () => {
    const dataDir = Path.join(fileURLToPath(import.meta.url), '../../data');
    const originalDataDir = Path.join(dataDir, '../../../src/tests/data');

    const context = before(async () => {
        const [rootJs, subJs] = (await Promise.all([
            import(Path.join(dataDir, 'root.js')),
            import(Path.join(dataDir, 'sub/sub.cjs')),
        ])) as [unknown, unknown];

        return { rootJs, subJs };
    });

    context.test('Finds first module', async ({ rootJs }) => {
        const found = await FindImport.findImport('root.js', {
            cwd: dataDir,
        });

        expect(found).to.deep.equal({
            filePath: Path.join(dataDir, 'root.js'),
            content: rootJs,
        });
        expectTypeOf(found).toEqualTypeOf<{
            filePath: string;
            content: unknown;
        } | null>();
    });

    suite('Provide multiple file names', () => {
        context.test('up', async ({ subJs }) => {
            const found = await FindImport.findImport(['root.js', 'sub.cjs'], {
                cwd: Path.join(dataDir, 'sub'),
            });

            expect(found).to.deep.equal({
                filePath: Path.join(dataDir, 'sub/sub.cjs'),
                content: subJs,
            });
        });

        context.test('down', async ({ rootJs }) => {
            const found = await FindImport.findImport(['root.js', 'sub.cjs'], {
                cwd: Path.join(dataDir, 'sub'),
                direction: 'down',
            });

            expect(found).to.deep.equal({
                filePath: Path.join(dataDir, 'root.js'),
                content: rootJs,
            });
        });

        context.test('startAt', async ({ subJs }) => {
            const found = await FindImport.findImport(['root.js', 'sub.cjs'], {
                cwd: Path.join(dataDir, 'sub'),
                startAt: Path.join(dataDir, 'sub'),
                direction: 'down',
            });

            expect(found).to.deep.equal({
                filePath: Path.join(dataDir, 'sub/sub.cjs'),
                content: subJs,
            });
        });

        context.test('directory', async ({ subJs }) => {
            const found = await FindImport.findImport(
                [Path.join('sub', 'sub.cjs'), 'root.js'],
                {
                    cwd: Path.join(dataDir, 'sub'),
                    direction: 'down',
                }
            );

            expect(found).to.deep.equal({
                filePath: Path.join(dataDir, 'sub/sub.cjs'),
                content: subJs,
            });
        });
    });

    test('Load json', async () => {
        const found = await FindImport.findImport<{ kind: string }>(
            ['root.json', 'sub.json'],
            { cwd: Path.join(originalDataDir, 'sub') }
        );

        expect(found).to.deep.equal({
            filePath: Path.join(originalDataDir, 'root.json'),
            content: {
                kind: 'root-json',
            },
        });
        expectTypeOf(found).toEqualTypeOf<{
            filePath: string;
            content: { kind: string };
        } | null>();
    });

    test('Not found', async () => {
        const notFound = await FindImport.findImport('does-not-exist.mjs');

        expect(notFound).to.equal(null);
    });
});
