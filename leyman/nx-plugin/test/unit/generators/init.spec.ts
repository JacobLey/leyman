import type { Tree } from '@nx/devkit';
import { lstat, mkdir, mkdtemp, readFile, readlink, rm } from 'node:fs/promises';
import Os from 'node:os';
import Path from 'node:path';
import { readJson, readNxJson, updateNxJson, writeJson } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { expect } from '@leyman/expect';
import { initGenerator, lifecycleBindings, lifecycleStages } from '@leyman/nx-plugin';
import { beforeEach, suite, test } from 'mocha-chain';

const catalogYaml = `packages:
  - packages/*
catalog:
  '@biomejs/biome': ^2.0.0
  '@leyman/check-package': ^1.0.0
  '@leyman/configs': ^1.0.0
  '@nx/js': ^23.0.0
  '@typescript/native': ^7.0.0
  nx-lifecycle: ^1.0.0
`;

// Compiled to `dist-test/unit/generators/`
const { version } = JSON.parse(
    await readFile(Path.join(import.meta.dirname, '../../../package.json'), 'utf8')
) as { version: string };

interface RootPackageJson {
    devDependencies: Record<string, string>;
}

const read = (tree: Tree, path: string): string => tree.read(path, 'utf8')!;

suite('initGenerator', () => {
    const withTree = beforeEach(() => {
        const tree = createTreeWithEmptyWorkspace();
        tree.write('pnpm-workspace.yaml', catalogYaml);
        return { tree };
    });

    withTree.test('Sets a workspace up for the plugin', async ({ tree }) => {
        const install = await initGenerator(tree);

        expect(install).to.be.a('function');
        expect(readNxJson(tree)!.plugins).to.deep.equal([
            { plugin: '@leyman/nx-plugin', options: { checkPackage: { profile: 'esm-only' } } },
            {
                plugin: 'nx-lifecycle/plugin',
                options: {
                    stages: lifecycleStages,
                    bindings: lifecycleBindings,
                    warnUnusedBindings: false,
                },
            },
        ]);
        expect(readJson<RootPackageJson>(tree, 'package.json').devDependencies).to.deep.equal({
            '@leyman/nx-plugin': `^${version}`,
            '@biomejs/biome': 'catalog:',
            '@leyman/check-package': 'catalog:',
            '@leyman/configs': 'catalog:',
            '@nx/js': 'catalog:',
            '@typescript/native': 'catalog:',
            'nx-lifecycle': 'catalog:',
        });
        expect(readJson(tree, 'tsconfig.json')).to.deep.equal({ files: [], references: [] });
        expect(readJson(tree, 'biome.json')).to.deep.equal({
            $schema: './node_modules/@biomejs/biome/configuration_schema.json',
            extends: ['@leyman/configs/biome.base.json'],
        });
        expect(read(tree, 'pnpm-workspace.yaml'))
            .to.satisfy((yaml: string) => yaml.startsWith(catalogYaml))
            .and.include('\ninjectWorkspacePackages: true\n')
            .and.include('\ndedupeInjectedDeps: false\n')
            .and.include("\nallowBuilds:\n  '@swc/core': false\n  nx: false\n");
        expect(read(tree, '.gitignore')).to.equal(
            'node_modules\ndist\ndist-test\n/.coverage\n/.package-surface\n/.nx/cache\n/.nx/workspace-data\n'
        );
    });

    withTree.test('Leaves alone what is already set', async ({ tree }) => {
        updateNxJson(tree, {
            plugins: [
                '@nx/js/typescript',
                { plugin: '@leyman/nx-plugin', options: { checkPackage: { profile: 'strict' } } },
                { plugin: 'nx-lifecycle/plugin', options: { stages: {} } },
            ],
        });
        writeJson(tree, 'package.json', { devDependencies: { '@biomejs/biome': '2.0.0' } });
        tree.write('biome.jsonc', '{}');
        tree.write('tsconfig.json', '{ "extends": "./tsconfig.base.json" }');
        tree.write(
            'pnpm-workspace.yaml',
            `${catalogYaml}allowBuilds:\n  nx: true\ninjectWorkspacePackages: false`
        );
        // Without a final newline
        tree.write('.gitignore', 'node_modules\ndist\ndist-test\n/.coverage\n/.nx/cache');

        await initGenerator(tree, { skipInstall: true });

        expect(readNxJson(tree)!.plugins).to.deep.equal([
            '@nx/js/typescript',
            { plugin: '@leyman/nx-plugin', options: { checkPackage: { profile: 'strict' } } },
            { plugin: 'nx-lifecycle/plugin', options: { stages: {} } },
        ]);
        expect(
            readJson<RootPackageJson>(tree, 'package.json').devDependencies['@biomejs/biome']
        ).to.equal('2.0.0');
        expect(tree.exists('biome.json')).to.equal(false);
        expect(read(tree, 'tsconfig.json')).to.equal('{ "extends": "./tsconfig.base.json" }');
        expect(read(tree, 'pnpm-workspace.yaml')).to.equal(
            `${catalogYaml}allowBuilds:\n  nx: true\n  '@swc/core': false\ninjectWorkspacePackages: false\n# Otherwise pnpm symlinks to the source again whenever peers allow it\ndedupeInjectedDeps: false\n`
        );
        expect(read(tree, '.gitignore')).to.equal(
            'node_modules\ndist\ndist-test\n/.coverage\n/.nx/cache\n/.package-surface\n/.nx/workspace-data\n'
        );
    });

    withTree.test(
        "Binds the targets by their names, and skips what isn't asked for",
        async ({ tree }) => {
            updateNxJson(tree, {
                plugins: ['@leyman/nx-plugin'],
            });
            tree.delete('pnpm-workspace.yaml');
            writeJson(tree, 'package.json', { devDependencies: { nx: '^24.0.0' } });
            writeJson(tree, 'packages/a/project.json', { name: 'a' });
            writeJson(tree, 'packages/a/package.json', {
                name: 'a',
                devDependencies: {
                    '@biomejs/biome': '^2.0.0',
                    '@leyman/check-package': '^1.0.0',
                    '@leyman/configs': '^1.0.0',
                    '@typescript/native': '^7.0.0',
                },
            });
            writeJson(tree, 'biome.json', {});
            const ignored =
                'node_modules\ndist\ndist-test\n/.coverage\n/.package-surface\n/.nx/cache\n/.nx/workspace-data\n';
            tree.write('.gitignore', ignored);

            const task = await initGenerator(tree, {
                lifecycle: false,
                skill: false,
                skipInstall: true,
            });

            expect(task).to.equal(undefined);

            expect(readNxJson(tree)!.plugins).to.deep.equal(['@leyman/nx-plugin']);
            const { devDependencies } = readJson<RootPackageJson>(tree, 'package.json');
            // Nx's own plugins take the version of nx
            expect(devDependencies).to.include({ '@nx/js': '^24.0.0' });
            expect(devDependencies).to.not.have.property('nx-lifecycle');
            expect(tree.exists('pnpm-workspace.yaml')).to.equal(false);
            // Ignores everything already
            expect(read(tree, '.gitignore')).to.equal(ignored);
        }
    );

    withTree.test('Binds renamed targets, without those turned off', async ({ tree }) => {
        updateNxJson(tree, {
            plugins: [
                {
                    plugin: '@leyman/nx-plugin',
                    options: { targets: { biome: { name: 'format' }, eslint: false } },
                },
            ],
        });
        // Without a final newline
        tree.write('pnpm-workspace.yaml', `${catalogYaml}dedupeInjectedDeps: true`);

        await initGenerator(tree, { skipInstall: true });

        const lifecycle = readNxJson(tree)!.plugins![1] as {
            options: { bindings: Record<string, string> };
        };
        expect(lifecycle.options.bindings).to.include({ format: 'prepare:format' });
        expect(lifecycle.options.bindings).to.not.have.any.keys('biome', 'eslint');
        expect(read(tree, 'pnpm-workspace.yaml')).to.equal(
            `${catalogYaml}dedupeInjectedDeps: true\n# Install workspace dependencies as copies of their published files, like a package from the registry.\n# Builds keep the copies current (\`sync-injected\`).\ninjectWorkspacePackages: true\n# Install scripts of the packages the targets run, which they don't need\nallowBuilds:\n  '@swc/core': false\n  nx: false\n`
        );
    });

    withTree.test('Keeps a pnpm-workspace.yaml that injects already', async ({ tree }) => {
        updateNxJson(tree, { plugins: [{ plugin: '@leyman/nx-plugin' }] });
        const yaml = `${catalogYaml}injectWorkspacePackages: true\ndedupeInjectedDeps: false\nallowBuilds:\n  '@swc/core': true\n  nx: false\n`;
        tree.write('pnpm-workspace.yaml', yaml);

        await initGenerator(tree, { lifecycle: false, skipInstall: true });

        expect(read(tree, 'pnpm-workspace.yaml')).to.equal(yaml);
        expect(readNxJson(tree)!.plugins).to.deep.equal([{ plugin: '@leyman/nx-plugin' }]);
    });

    withTree.test("Takes Nx's plugins at the catalog's version of nx", async ({ tree }) => {
        tree.write('pnpm-workspace.yaml', catalogYaml.replace("'@nx/js': ^23.0.0", 'nx: ^24.0.0'));

        await initGenerator(tree, { skipInstall: true });

        expect(readJson<RootPackageJson>(tree, 'package.json').devDependencies['@nx/js']).to.equal(
            '^24.0.0'
        );
    });

    withTree.test('Fails on invalid plugin options', async ({ tree }) => {
        updateNxJson(tree, { plugins: [{ plugin: '@leyman/nx-plugin', options: { a: 1 } }] });

        await expect(initGenerator(tree)).to.eventually.be.rejectedWith(
            /^Invalid @leyman\/nx-plugin options in nx\.json/v
        );
    });

    withTree.test('Adds settings to an empty pnpm-workspace.yaml', async ({ tree }) => {
        tree.write('pnpm-workspace.yaml', '');
        tree.delete('nx.json');
        writeJson(tree, 'packages/a/project.json', { name: 'a' });
        writeJson(tree, 'packages/a/package.json', {
            name: 'a',
            devDependencies: {
                '@biomejs/biome': '*',
                '@leyman/check-package': '*',
                '@leyman/configs': '*',
                '@nx/js': '*',
                '@typescript/native': '*',
                'nx-lifecycle': '*',
            },
        });

        await initGenerator(tree, { skipInstall: true });

        expect(read(tree, 'pnpm-workspace.yaml')).to.match(/^# Install workspace/v);
        expect(readNxJson(tree)!.plugins).to.have.length(2);
    });

    test("Matches this repository's lifecycle", async () => {
        // Compiled to `dist-test/unit/generators/`
        const lifecycle = JSON.parse(
            await readFile(
                Path.join(import.meta.dirname, '../../../../main/lifecycle.json'),
                'utf8'
            )
        ) as { stages: unknown; bindings: Record<string, string> };

        expect(lifecycle.stages).to.deep.equal(lifecycleStages);
        // A fork binds only the targets it takes
        const bound = Object.entries(lifecycleBindings).filter(([target]) =>
            Object.hasOwn(lifecycle.bindings, target)
        );
        expect(bound).to.have.length.greaterThan(0);
        expect(lifecycle.bindings).to.include(Object.fromEntries(bound));
    });

    suite('Skill links', () => {
        const withRoot = withTree.beforeEach(async ({ tree }) => {
            const root = await mkdtemp(Path.join(Os.tmpdir(), 'nx-plugin-init-'));
            // The links are made on disk, under the tree's root
            Object.defineProperty(tree, 'root', { value: root });
            return { root };
        });
        withRoot.afterEach(async ({ root }) => {
            await rm(root, { recursive: true, force: true });
        });

        withRoot.test(
            'Links the principles skill once the tree is written',
            async ({ tree, root }) => {
                const task = await initGenerator(tree, { skipInstall: true });
                await task!();

                expect(await readlink(Path.join(root, '.agents/skills/principles'))).to.equal(
                    '../../node_modules/@leyman/configs/skills/principles'
                );
                expect(await readlink(Path.join(root, '.claude/skills'))).to.equal(
                    '../.agents/skills'
                );
            }
        );

        withRoot.test('Leaves alone what is already there', async ({ tree, root }) => {
            await mkdir(Path.join(root, '.claude/skills/own'), { recursive: true });

            const task = await initGenerator(tree, { skipInstall: true });
            await task!();

            const claude = await lstat(Path.join(root, '.claude/skills'));
            expect(claude.isDirectory()).to.equal(true);
            expect(await readlink(Path.join(root, '.agents/skills/principles'))).to.equal(
                '../../node_modules/@leyman/configs/skills/principles'
            );
        });
    });
});
