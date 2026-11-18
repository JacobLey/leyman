import { mkdir, symlink } from 'node:fs/promises';
import Path from 'node:path';
import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';
import { scan } from '#internal/lib/scan.js';
import { createDirectory } from '#test/helpers/directory.js';

const token = ['@drop', 'when'].join('-');
const all = { paths: [], exclude: [] };

suite('scan', () => {
    const withDirectory = beforeEach(async () => createDirectory());

    withDirectory.afterEach(async ({ directory }) => {
        await directory.cleanup();
    });

    withDirectory.test('Finds markers, by path then line', async ({ directory, write }) => {
        await write({
            'b.ts': `// ${token} 2026-01-02\n// ${token} 2026-01-03\n`,
            'a/z.md': `<!-- ${token} 2026-01-01 -->\n`,
        });

        expect(await scan(directory.path, all)).to.deep.equal({
            files: 2,
            markers: [
                { path: 'a/z.md', line: 1, condition: { kind: 'date', date: '2026-01-01' } },
                { path: 'b.ts', line: 1, condition: { kind: 'date', date: '2026-01-02' } },
                { path: 'b.ts', line: 2, condition: { kind: 'date', date: '2026-01-03' } },
            ],
            malformed: [],
        });
    });

    withDirectory.test('Reports malformed markers', async ({ directory, write }) => {
        await write({ 'a.ts': `\n// ${token} soon\n` });

        const result = await scan(directory.path, all);
        expect(result).to.have.deep.property('malformed').with.length(1);
        expect(result).to.have.nested.property('malformed[0].line', 2);
    });

    withDirectory.test('Skips what .gitignore files ignore', async ({ directory, write }) => {
        await write({
            '.gitignore': 'ignored/\n*.log\n',
            'a.log': `${token} soon`,
            'ignored/a.ts': `${token} soon`,
            'kept.ts': `${token} 2026-01-01`,
        });

        const result = await scan(directory.path, all);
        expect(result).to.have.property('malformed').that.deep.equals([]);
        expect(result).to.include({ files: 2 });
    });

    withDirectory.test(
        'Reads nested .gitignore files, with negations',
        async ({ directory, write }) => {
            await write({
                '.gitignore': '*.gen.ts\n',
                'a/.gitignore': '!keep.gen.ts\nlocal/\n',
                'a/keep.gen.ts': `${token} 2026-01-01`,
                'a/drop.gen.ts': `${token} soon`,
                'a/local/a.ts': `${token} soon`,
                'b/local/a.ts': `${token} 2026-01-02`,
            });

            const result = await scan(directory.path, all);
            expect(result).to.have.property('malformed').that.deep.equals([]);
            expect(result)
                .to.have.property('markers')
                .that.satisfies(
                    (markers: readonly { path: string }[]) =>
                        markers.map(({ path }) => path).join(',') === 'a/keep.gen.ts,b/local/a.ts'
                );
        }
    );

    withDirectory.test('Never enters an ignored directory', async ({ directory, write }) => {
        await write({
            '.gitignore': 'build/\n!build/keep.ts\n',
            'build/keep.ts': `${token} soon`,
        });

        expect(await scan(directory.path, all)).to.include({ files: 1 });
    });

    withDirectory.test(
        'Skips .git, binary files and symbolic links',
        async ({ directory, write }) => {
            await write({
                '.git/config': `${token} soon`,
                'a.ts': `${token} 2026-01-01`,
                'binary.bin': new Uint8Array([0, ...Buffer.from(`${token} soon`)]),
            });
            await symlink('a.ts', Path.join(directory.path, 'link.ts'));
            await mkdir(Path.join(directory.path, 'linked'));
            await symlink('..', Path.join(directory.path, 'linked', 'up'));

            const result = await scan(directory.path, all);
            expect(result).to.include({ files: 1 });
            expect(result).to.have.property('malformed').that.deep.equals([]);
        }
    );

    withDirectory.test('Scans only the paths given', async ({ directory, write }) => {
        await write({
            'a/one.ts': `${token} 2026-01-01`,
            'b/two.ts': `${token} soon`,
            'c.ts': `${token} 2026-01-03`,
        });

        const result = await scan(directory.path, { paths: ['a/', 'c.ts'], exclude: [] });
        expect(result).to.include({ files: 2 });
        expect(result).to.have.property('malformed').that.deep.equals([]);
    });

    withDirectory.test(
        'Leaves out excluded files and directories',
        async ({ directory, write }) => {
            await write({
                'a/one.ts': `${token} 2026-01-01`,
                'a/skip/two.ts': `${token} soon`,
                'b.ts': `${token} soon`,
            });

            const result = await scan(directory.path, { paths: [], exclude: ['a/skip', './b.ts'] });
            expect(result).to.include({ files: 1 });
            expect(result).to.have.property('malformed').that.deep.equals([]);
        }
    );

    withDirectory.test(
        'Applies .gitignore files on the way to a path',
        async ({ directory, write }) => {
            await write({ '.gitignore': 'dist/\n', 'a/dist/a.ts': `${token} soon` });

            expect(await scan(directory.path, { paths: ['a'], exclude: [] })).to.include({
                files: 0,
            });
        }
    );

    withDirectory.test('Rejects a path that does not exist', async ({ directory }) => {
        expect(await scan(directory.path, { paths: ['missing'], exclude: ['gone'] })).to.deep.equal(
            {
                error: 'missing does not exist\ngone does not exist',
            }
        );
    });

    withDirectory.test('Rejects a path outside the working directory', async ({ directory }) => {
        expect(await scan(directory.path, { paths: ['..'], exclude: [] })).to.deep.equal({
            error: '.. is outside the working directory',
        });
    });
});
