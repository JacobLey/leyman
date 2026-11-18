import { symlink, unlink } from 'node:fs/promises';
import Path from 'node:path';
import { expect } from '@leyman/expect';
import { beforeEach, suite } from 'mocha-chain';
import { scan } from '#internal/lib/scan.js';
import { createRepo } from '#test/helpers/repo.js';

const token = ['drop', 'when:'].join('-');

suite('scan', () => {
    suite('In a git repository', () => {
        const withRepo = beforeEach(async () => createRepo());

        withRepo.afterEach(async ({ repo }) => {
            await repo.cleanup();
        });

        withRepo.test(
            'Finds markers in tracked files, by path then line',
            async ({ repo, write, git }) => {
                await write({
                    'b.ts': `// ${token} 2026-01-02\n// ${token} 2026-01-03\n`,
                    'a/z.md': `<!-- ${token} 2026-01-01 -->\n`,
                });
                await git('add', '.');

                const result = await scan(repo.path, []);
                expect(result).to.deep.equal({
                    files: 2,
                    markers: [
                        {
                            path: 'a/z.md',
                            line: 1,
                            condition: { kind: 'date', date: '2026-01-01' },
                        },
                        { path: 'b.ts', line: 1, condition: { kind: 'date', date: '2026-01-02' } },
                        { path: 'b.ts', line: 2, condition: { kind: 'date', date: '2026-01-03' } },
                    ],
                    malformed: [],
                });
            }
        );

        withRepo.test('Reports malformed markers', async ({ repo, write }) => {
            await write({ 'a.ts': `\n// ${token} soon\n` });

            const result = await scan(repo.path, []);
            expect(result).to.have.deep.property('malformed').with.length(1);
            expect(result).to.have.nested.property('malformed[0].line', 2);
        });

        withRepo.test('Reads untracked files, but not ignored ones', async ({ repo, write }) => {
            await write({
                '.gitignore': 'ignored/\n',
                'new.ts': `${token} 2026-01-01`,
                'ignored/a.ts': `${token} 2026-01-01`,
            });

            const result = await scan(repo.path, []);
            expect(result).to.have.nested.property('markers[0].path', 'new.ts');
            expect(result).to.have.property('markers').with.length(1);
        });

        withRepo.test('Skips binary files and symbolic links', async ({ repo, write, git }) => {
            await write({
                'a.ts': `${token} 2026-01-01`,
                'binary.bin': new Uint8Array([0, ...Buffer.from(`${token} soon`)]),
            });
            await symlink('a.ts', Path.join(repo.path, 'link.ts'));
            await git('add', '.');

            const result = await scan(repo.path, []);
            expect(result).to.include({ files: 1 });
            expect(result).to.have.property('malformed').that.deep.equals([]);
        });

        withRepo.test(
            'Skips a file deleted from the work tree only',
            async ({ repo, write, git }) => {
                await write({ 'a.ts': `${token} soon` });
                await git('add', '.');
                await unlink(Path.join(repo.path, 'a.ts'));

                expect(await scan(repo.path, [])).to.deep.equal({
                    files: 0,
                    markers: [],
                    malformed: [],
                });
            }
        );

        withRepo.test('Scans only the pathspecs given', async ({ repo, write }) => {
            await write({
                'a/one.ts': `${token} 2026-01-01`,
                'a/skip/two.ts': `${token} 2026-01-02`,
                'b/three.ts': `${token} 2026-01-03`,
            });

            const result = await scan(repo.path, ['a', ':!a/skip']);
            expect(result).to.have.property('markers').with.length(1);
            expect(result).to.have.nested.property('markers[0].path', 'a/one.ts');
        });

        withRepo.test('Gives paths relative to where it runs', async ({ repo, write }) => {
            await write({ 'a/one.ts': `${token} 2026-01-01`, 'b/two.ts': `${token} 2026-01-02` });

            const result = await scan(Path.join(repo.path, 'a'), ['../b']);
            expect(result).to.have.nested.property('markers[0].path', '../b/two.ts');
        });
    });

    suite('Outside a git repository', () => {
        const withDirectory = beforeEach(async () => createRepo({ git: false }));

        withDirectory.afterEach(async ({ repo }) => {
            await repo.cleanup();
        });

        withDirectory.test("Returns git's error", async ({ repo }) => {
            const result = await scan(repo.path, []);
            expect(result).to.have.property('error').that.contains('not a git repository');
        });
    });
});
