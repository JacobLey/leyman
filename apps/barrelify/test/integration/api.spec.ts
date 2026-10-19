import Path from 'node:path';
import { expect } from '@leyman/expect';
import { barrelify } from 'barrelify';
import { beforeEach, suite, test } from 'mocha-chain';
import { barrel, createTmpDir, HEADER } from './lib/fixtures.js';

const rootDir = Path.join(import.meta.filename, '../../..');

const moduleFiles = {
    'a.ts': '',
    'b.cts': '',
    'c.mts': '',
    'index.ts': HEADER,
    'index.cts': HEADER,
    'index.mts': HEADER,
};

suite('barrelify', () => {
    suite('Package fixtures', () => {
        test('Reports out of sync files', async () => {
            expect(
                await barrelify({
                    cwd: rootDir,
                    dryRun: true,
                    ignore: ['foo'],
                })
            ).to.deep.equal([Path.join(rootDir, 'test/data/wrong/index.ts')]);
        });

        test('Accepts a file as cwd', async () => {
            expect(
                await barrelify({
                    cwd: './bin.mjs',
                    ignore: ['**/wrong/*'],
                })
            ).to.deep.equal([]);
        });
    });

    suite('Module type', () => {
        const withTmpDir = beforeEach(createTmpDir);
        withTmpDir.afterEach(async ctx => {
            await ctx.tmpDir.cleanup();
        });

        withTmpDir.test('"type": "module" package', async ctx => {
            await ctx.writeFiles({
                'package.json': JSON.stringify({ type: 'module' }),
                ...moduleFiles,
            });

            expect(await barrelify({ cwd: ctx.tmpDir.path })).to.have.members([
                ctx.resolve('index.cts'),
                ctx.resolve('index.mts'),
                ctx.resolve('index.ts'),
            ]);

            expect(await ctx.read('index.ts')).to.equal(
                barrel(
                    "export * from './a.js';",
                    "export * from './b.cjs';",
                    "export * from './c.mjs';"
                )
            );
            expect(await ctx.read('index.cts')).to.equal(barrel("export * from './b.cjs';"));
            expect(await ctx.read('index.mts')).to.equal(
                barrel(
                    "export * from './a.js';",
                    "export * from './b.cjs';",
                    "export * from './c.mjs';"
                )
            );
        });

        for (const [name, packageJson] of [
            [
                '"type": "commonjs" package',
                { 'package.json': JSON.stringify({ type: 'commonjs' }) },
            ],
            ['Package without type', { 'package.json': JSON.stringify({ name: 'no-type' }) }],
            ['No package.json', {}],
        ] as const) {
            withTmpDir.test(name, async ctx => {
                await ctx.writeFiles({ ...packageJson, ...moduleFiles });

                await barrelify({ cwd: ctx.tmpDir.path });

                expect(await ctx.read('index.ts')).to.equal(
                    barrel("export * from './a.js';", "export * from './b.cjs';")
                );
                expect(await ctx.read('index.cts')).to.equal(
                    barrel("export * from './a.js';", "export * from './b.cjs';")
                );
                expect(await ctx.read('index.mts')).to.equal(
                    barrel(
                        "export * from './a.js';",
                        "export * from './b.cjs';",
                        "export * from './c.mjs';"
                    )
                );
            });
        }

        withTmpDir.test('Uses nearest package.json', async ctx => {
            await ctx.writeFiles({
                'package.json': JSON.stringify({ type: 'commonjs' }),
                'nested/package.json': JSON.stringify({ type: 'module' }),
                'nested/a.ts': '',
                'nested/b.cts': '',
                'nested/index.cts': HEADER,
            });

            await barrelify({ cwd: ctx.tmpDir.path });

            expect(await ctx.read('nested/index.cts')).to.equal(barrel("export * from './b.cjs';"));
        });

        withTmpDir.test('Malformed nearest package.json throws', async ctx => {
            await ctx.writeFiles({
                'package.json': JSON.stringify({ type: 'module' }),
                'nested/package.json': '{ "type": "commonjs", }',
                'nested/a.ts': '',
                'nested/index.ts': HEADER,
            });

            await expect(barrelify({ cwd: ctx.tmpDir.path })).to.be.rejectedWith(
                Error,
                'Invalid package config'
            );
            expect(await ctx.read('nested/index.ts')).to.equal(HEADER);
        });
    });

    suite('Barrel content', () => {
        const withTmpDir = beforeEach(createTmpDir);
        withTmpDir.afterEach(async ctx => {
            await ctx.tmpDir.cleanup();
        });

        withTmpDir.test('Up to date files are not reported or rewritten', async ctx => {
            const content = barrel("export * from './a.js';");
            await ctx.writeFiles({ 'a.ts': '', 'index.ts': content });

            expect(await barrelify({ cwd: ctx.tmpDir.path })).to.deep.equal([]);
            expect(await ctx.read('index.ts')).to.equal(content);
        });

        withTmpDir.test('Ignores index files without header', async ctx => {
            const content = `// Not a barrel\n${HEADER}\n`;
            await ctx.writeFiles({ 'a.ts': '', 'index.ts': content });

            expect(await barrelify({ cwd: ctx.tmpDir.path })).to.deep.equal([]);
            expect(await ctx.read('index.ts')).to.equal(content);
        });

        withTmpDir.test('Replaces existing content and sorts exports', async ctx => {
            await ctx.writeFiles({
                'b.ts': '',
                'a.ts': '',
                'index.ts': `${HEADER}\n\n// Removed\nexport * from './removed.js';\n`,
            });

            await barrelify({ cwd: ctx.tmpDir.path });

            expect(await ctx.read('index.ts')).to.equal(
                barrel("export * from './a.js';", "export * from './b.js';")
            );
        });

        withTmpDir.test('Preserves type-only exports', async ctx => {
            await ctx.writeFiles({
                'a.ts': '',
                'b.ts': '',
                'c.cts': '',
                'index.ts': barrel("export type * from './a.js';", "export type * from './c.cts';"),
            });

            await barrelify({ cwd: ctx.tmpDir.path });

            expect(await ctx.read('index.ts')).to.equal(
                barrel(
                    "export type * from './a.js';",
                    "export * from './b.js';",
                    "export type * from './c.cjs';"
                )
            );
        });

        withTmpDir.test('Exports .tsx files and manages index.tsx', async ctx => {
            await ctx.writeFiles({
                'package.json': JSON.stringify({ type: 'module' }),
                'Button.tsx': '',
                'util.ts': '',
                'index.tsx': barrel("export type * from './util.js';"),
                'index.cts': HEADER,
            });

            await barrelify({ cwd: ctx.tmpDir.path });

            expect(await ctx.read('index.tsx')).to.equal(
                barrel("export * from './Button.js';", "export type * from './util.js';")
            );
            // `.tsx` is ESM in a module package, so CommonJS can't re-export it
            expect(await ctx.read('index.cts')).to.equal(barrel());
        });

        withTmpDir.test('A .ts and .tsx file of the same name export once', async ctx => {
            await ctx.writeFiles({ 'a.ts': '', 'a.tsx': '', 'index.ts': HEADER });

            await barrelify({ cwd: ctx.tmpDir.path });

            expect(await ctx.read('index.ts')).to.equal(barrel("export * from './a.js';"));
        });

        withTmpDir.test('Skips declaration files', async ctx => {
            await ctx.writeFiles({
                'a.ts': '',
                'globals.d.ts': '',
                'types.d.cts': '',
                'index.ts': HEADER,
            });

            await barrelify({ cwd: ctx.tmpDir.path });

            expect(await ctx.read('index.ts')).to.equal(barrel("export * from './a.js';"));
        });

        withTmpDir.test('Only exports sibling files', async ctx => {
            await ctx.writeFiles({
                'a.ts': '',
                'a.js': '',
                'README.md': '',
                'index.ts': HEADER,
                'sub/b.ts': '',
                'sub/index.ts': HEADER,
            });

            expect(await barrelify({ cwd: ctx.tmpDir.path })).to.have.members([
                ctx.resolve('index.ts'),
                ctx.resolve('sub/index.ts'),
            ]);

            expect(await ctx.read('index.ts')).to.equal(barrel("export * from './a.js';"));
            expect(await ctx.read('sub/index.ts')).to.equal(barrel("export * from './b.js';"));
        });
    });

    suite('Subdirectories', () => {
        const withTmpDir = beforeEach(createTmpDir);
        withTmpDir.afterEach(async ctx => {
            await ctx.tmpDir.cleanup();
        });

        const marker = '// AUTO-BARREL subdirectories';

        withTmpDir.test('Re-exports subdirectories with an index file', async ctx => {
            await ctx.writeFiles({
                '.gitignore': 'ignored/\n',
                'a.ts': '',
                'index.ts': `${marker}\nexport type * from './types/index.js';\n`,
                'sub/index.ts': '',
                'sub/b.ts': '',
                'types/index.ts': '',
                'no-index/c.ts': '',
                'ignored/index.ts': '',
                'node_modules/dep/index.ts': '',
                'deep/er/index.ts': '',
            });

            expect(await barrelify({ cwd: ctx.tmpDir.path })).to.deep.equal([
                ctx.resolve('index.ts'),
            ]);
            expect(await ctx.read('index.ts')).to.equal(
                [
                    marker,
                    '',
                    "export * from './a.js';",
                    "export * from './sub/index.js';",
                    "export type * from './types/index.js';",
                    '',
                ].join('\n')
            );
            expect(await barrelify({ cwd: ctx.tmpDir.path, dryRun: true })).to.deep.equal([]);
        });

        withTmpDir.test('Follows the module system', async ctx => {
            await ctx.writeFiles({
                'package.json': JSON.stringify({ type: 'commonjs' }),
                'index.cts': marker,
                'cjs/index.cts': '',
                'esm/index.mts': '',
            });

            await barrelify({ cwd: ctx.tmpDir.path });

            expect(await ctx.read('index.cts')).to.equal(
                [marker, '', "export * from './cjs/index.cjs';", ''].join('\n')
            );
        });
    });

    suite('Options', () => {
        const withTmpDir = beforeEach(createTmpDir);
        withTmpDir.afterEach(async ctx => {
            await ctx.tmpDir.cleanup();
        });

        withTmpDir.test('Dry run reports without writing', async ctx => {
            await ctx.writeFiles({ 'a.ts': '', 'index.ts': HEADER });

            expect(await barrelify({ cwd: ctx.tmpDir.path, dryRun: true })).to.deep.equal([
                ctx.resolve('index.ts'),
            ]);
            expect(await ctx.read('index.ts')).to.equal(HEADER);
        });

        withTmpDir.test('Ignores matching index files', async ctx => {
            await ctx.writeFiles({
                'posix/a.ts': '',
                'posix/index.ts': HEADER,
                'win/a.ts': '',
                'win/index.ts': HEADER,
                'kept/a.ts': '',
                'kept/index.ts': HEADER,
            });

            expect(
                await barrelify({
                    cwd: ctx.tmpDir.path,
                    ignore: ['posix/**', String.raw`win\**`],
                })
            ).to.deep.equal([ctx.resolve('kept/index.ts')]);
            expect(await ctx.read('posix/index.ts')).to.equal(HEADER);
            expect(await ctx.read('win/index.ts')).to.equal(HEADER);
        });

        withTmpDir.test('Skips node_modules and gitignored files', async ctx => {
            await ctx.writeFiles({
                '.gitignore': 'ignored/\ngenerated.ts\n',
                'a.ts': '',
                'generated.ts': '',
                'index.ts': HEADER,
                'ignored/a.ts': '',
                'ignored/index.ts': HEADER,
                'node_modules/pkg/a.ts': '',
                'node_modules/pkg/index.ts': HEADER,
            });

            expect(await barrelify({ cwd: ctx.tmpDir.path })).to.deep.equal([
                ctx.resolve('index.ts'),
            ]);
            expect(await ctx.read('index.ts')).to.equal(barrel("export * from './a.js';"));
            expect(await ctx.read('ignored/index.ts')).to.equal(HEADER);
            expect(await ctx.read('node_modules/pkg/index.ts')).to.equal(HEADER);
        });

        withTmpDir.test('Applies nested .gitignore files to their own directory', async ctx => {
            await ctx.writeFiles({
                'a.ts': '',
                'generated.ts': '',
                'index.ts': HEADER,
                'sub/.gitignore': 'generated.ts\n',
                'sub/a.ts': '',
                'sub/generated.ts': '',
                'sub/index.ts': HEADER,
            });

            await barrelify({ cwd: ctx.tmpDir.path });

            expect(await ctx.read('index.ts')).to.equal(
                barrel("export * from './a.js';", "export * from './generated.js';")
            );
            expect(await ctx.read('sub/index.ts')).to.equal(barrel("export * from './a.js';"));
        });

        withTmpDir.test('Re-includes files negated by a .gitignore', async ctx => {
            await ctx.writeFiles({
                '.gitignore': '*.gen.ts\n!kept.gen.ts\n',
                'dropped.gen.ts': '',
                'kept.gen.ts': '',
                'index.ts': HEADER,
            });

            await barrelify({ cwd: ctx.tmpDir.path });

            expect(await ctx.read('index.ts')).to.equal(barrel("export * from './kept.gen.js';"));
        });

        withTmpDir.test('Applies .gitignore files above cwd up to the git root', async ctx => {
            await ctx.writeFiles({
                '.git/HEAD': '',
                '.gitignore': 'generated.ts\n',
                'pkg/a.ts': '',
                'pkg/generated.ts': '',
                'pkg/index.ts': HEADER,
            });

            await barrelify({ cwd: ctx.resolve('pkg') });

            expect(await ctx.read('pkg/index.ts')).to.equal(barrel("export * from './a.js';"));
        });

        withTmpDir.test('Accepts a .git file as the git root', async ctx => {
            await ctx.writeFiles({
                '.git': 'gitdir: ../.git/worktrees/repo\n',
                '.gitignore': 'generated.ts\n',
                'pkg/a.ts': '',
                'pkg/generated.ts': '',
                'pkg/index.ts': HEADER,
            });

            await barrelify({ cwd: ctx.resolve('pkg') });

            expect(await ctx.read('pkg/index.ts')).to.equal(barrel("export * from './a.js';"));
        });

        withTmpDir.test('Skips .gitignore files above the git root', async ctx => {
            await ctx.writeFiles({
                '.gitignore': 'generated.ts\n',
                'repo/.git/HEAD': '',
                'repo/a.ts': '',
                'repo/generated.ts': '',
                'repo/index.ts': HEADER,
            });

            await barrelify({ cwd: ctx.resolve('repo') });

            expect(await ctx.read('repo/index.ts')).to.equal(
                barrel("export * from './a.js';", "export * from './generated.js';")
            );
        });

        withTmpDir.test(
            'Applies cwd .gitignore to subdirectories outside a git repository',
            async ctx => {
                await ctx.writeFiles({
                    '.gitignore': 'generated.ts\n',
                    'sub/a.ts': '',
                    'sub/generated.ts': '',
                    'sub/index.ts': HEADER,
                });

                await barrelify({ cwd: ctx.tmpDir.path });

                expect(await ctx.read('sub/index.ts')).to.equal(barrel("export * from './a.js';"));
            }
        );

        withTmpDir.test('Skips .gitignore files above cwd outside a git repository', async ctx => {
            await ctx.writeFiles({
                '.gitignore': 'generated.ts\n',
                'pkg/a.ts': '',
                'pkg/generated.ts': '',
                'pkg/index.ts': HEADER,
            });

            await barrelify({ cwd: ctx.resolve('pkg') });

            expect(await ctx.read('pkg/index.ts')).to.equal(
                barrel("export * from './a.js';", "export * from './generated.js';")
            );
        });

        withTmpDir.test('Defaults to process cwd', async ctx => {
            await ctx.writeFiles({ 'a.ts': '', 'index.ts': HEADER });

            const originalCwd = process.cwd();
            process.chdir(ctx.tmpDir.path);
            try {
                expect(await barrelify()).to.deep.equal([Path.join(process.cwd(), 'index.ts')]);
            } finally {
                process.chdir(originalCwd);
            }
            expect(await ctx.read('index.ts')).to.equal(barrel("export * from './a.js';"));
        });
    });
});
