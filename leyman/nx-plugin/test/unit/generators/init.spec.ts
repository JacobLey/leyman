import type { Tree } from '@nx/devkit';
import { readFile } from 'node:fs/promises';
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
  nx-lifecycle: ^1.0.0
`;

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
            { plugin: '@leyman/nx-plugin', options: {} },
            {
                plugin: 'nx-lifecycle/plugin',
                options: { stages: lifecycleStages, bindings: lifecycleBindings },
            },
        ]);
        expect(readJson<RootPackageJson>(tree, 'package.json').devDependencies).to.deep.equal({
            '@leyman/nx-plugin': '^0.0.1',
            '@biomejs/biome': 'catalog:',
            '@leyman/check-package': 'catalog:',
            '@leyman/configs': 'catalog:',
            '@nx/js': 'catalog:',
            'nx-lifecycle': 'catalog:',
        });
        expect(readJson(tree, 'biome.json')).to.deep.equal({
            $schema: './node_modules/@biomejs/biome/configuration_schema.json',
            extends: ['@leyman/configs/biome.base.json'],
        });
        expect(read(tree, 'pnpm-workspace.yaml'))
            .to.satisfy((yaml: string) => yaml.startsWith(catalogYaml))
            .and.include('\ninjectWorkspacePackages: true\n')
            .and.include('\ndedupeInjectedDeps: false\n');
        expect(read(tree, '.claude/skills/principles/SKILL.md')).to.include(
            'https://jacobley.github.io/leyman/framework/principles'
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
        tree.write('pnpm-workspace.yaml', `${catalogYaml}injectWorkspacePackages: false`);
        tree.write('.claude/skills/principles/SKILL.md', 'Own');

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
        expect(read(tree, 'pnpm-workspace.yaml')).to.equal(
            `${catalogYaml}injectWorkspacePackages: false\n# Otherwise pnpm symlinks to the source again whenever peers allow it\ndedupeInjectedDeps: false\n`
        );
        expect(read(tree, '.claude/skills/principles/SKILL.md')).to.equal('Own');
    });

    withTree.test(
        "Binds the targets by their names, and skips what isn't asked for",
        async ({ tree }) => {
            updateNxJson(tree, {
                plugins: ['@leyman/nx-plugin'],
            });
            tree.delete('pnpm-workspace.yaml');
            writeJson(tree, 'packages/a/project.json', { name: 'a' });
            writeJson(tree, 'packages/a/package.json', {
                name: 'a',
                devDependencies: {
                    '@biomejs/biome': '^2.0.0',
                    '@leyman/check-package': '^1.0.0',
                    '@leyman/configs': '^1.0.0',
                    '@nx/js': '^23.0.0',
                },
            });
            writeJson(tree, 'biome.json', {});

            await initGenerator(tree, { lifecycle: false, skill: false, skipInstall: true });

            expect(readNxJson(tree)!.plugins).to.deep.equal(['@leyman/nx-plugin']);
            expect(
                readJson<RootPackageJson>(tree, 'package.json').devDependencies
            ).to.not.have.property('nx-lifecycle');
            expect(tree.exists('pnpm-workspace.yaml')).to.equal(false);
            expect(tree.exists('.claude')).to.equal(false);
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
        tree.write('pnpm-workspace.yaml', `${catalogYaml}dedupeInjectedDeps: true\n`);

        await initGenerator(tree, { skipInstall: true });

        const lifecycle = readNxJson(tree)!.plugins![1] as {
            options: { bindings: Record<string, string> };
        };
        expect(lifecycle.options.bindings).to.include({ format: 'prepare:format' });
        expect(lifecycle.options.bindings).to.not.have.any.keys('biome', 'eslint');
        expect(read(tree, 'pnpm-workspace.yaml')).to.equal(
            `${catalogYaml}dedupeInjectedDeps: true\n# Install workspace dependencies as copies of their published files, like a package from the registry.\n# Builds keep the copies current (\`sync-injected\`).\ninjectWorkspacePackages: true\n`
        );
    });

    withTree.test('Keeps a pnpm-workspace.yaml that injects already', async ({ tree }) => {
        updateNxJson(tree, { plugins: [{ plugin: '@leyman/nx-plugin' }] });
        const yaml = `${catalogYaml}injectWorkspacePackages: true\ndedupeInjectedDeps: false\n`;
        tree.write('pnpm-workspace.yaml', yaml);

        await initGenerator(tree, { lifecycle: false, skipInstall: true });

        expect(read(tree, 'pnpm-workspace.yaml')).to.equal(yaml);
        expect(readNxJson(tree)!.plugins).to.deep.equal([{ plugin: '@leyman/nx-plugin' }]);
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
});
