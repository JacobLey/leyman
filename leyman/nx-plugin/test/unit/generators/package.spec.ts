import type { Tree } from '@nx/devkit';
import { readJson, updateNxJson, writeJson } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { expect } from '@leyman/expect';
import { packageGenerator } from '@leyman/nx-plugin';
import { beforeEach, suite } from 'mocha-chain';

const catalogYaml = `packages:
  - packages/*
catalog:
  '@biomejs/biome': ^2.0.0
  '@leyman/configs': ^1.0.0
  '@leyman/eslint-config': ^1.0.0
  '@leyman/expect': ^1.0.0
  '@swc/cli': ^0.7.0
  '@swc/core': ^1.0.0
  '@types/mocha': ^10.0.0
  '@types/node': ^25.0.0
  c8: ^11.0.0
  eslint: ^10.0.0
  mocha: ^11.0.0
  mocha-chain: ^1.0.0
  typescript: ^6.0.0
  vitest: ^5.0.0
catalogs:
  node-24:
    '@types/node': ^24.0.0
`;

const read = (tree: Tree, path: string): string => tree.read(path, 'utf8')!;

interface WrittenJson {
    $schema?: string;
    extends?: string;
    engines?: unknown;
    repository?: unknown;
    bugs?: unknown;
    devDependencies: Record<string, string>;
    targets: Record<string, unknown>;
}

const readWritten = (tree: Tree, path: string): WrittenJson => readJson<WrittenJson>(tree, path);

suite('packageGenerator', () => {
    const withTree = beforeEach(() => {
        const tree = createTreeWithEmptyWorkspace();
        tree.write('pnpm-workspace.yaml', catalogYaml);
        updateNxJson(tree, { plugins: [{ plugin: '@leyman/nx-plugin', options: {} }] });
        return { tree };
    });

    withTree.test('Adds a private package tested with Mocha', async ({ tree }) => {
        updateNxJson(tree, { plugins: [{ plugin: '@leyman/nx-plugin' }] });

        const install = await packageGenerator(tree, {
            directory: 'packages/my-lib/',
            description: 'Does things.',
        });

        expect(install).to.be.a('function');
        expect(readWritten(tree, 'packages/my-lib/package.json')).to.deep.equal({
            name: 'my-lib',
            version: '0.0.1',
            description: 'Does things.',
            private: true,
            type: 'module',
            sideEffects: false,
            types: './dist/index.js',
            files: ['dist', '!dist/**/*.map', '!dist/tsconfig.tsbuildinfo'],
            exports: { '.': './dist/index.js' },
            devDependencies: {
                '@biomejs/biome': 'catalog:',
                '@leyman/configs': 'catalog:',
                '@leyman/eslint-config': 'catalog:',
                '@leyman/expect': 'catalog:',
                '@swc/cli': 'catalog:',
                '@swc/core': 'catalog:',
                '@types/mocha': 'catalog:',
                '@types/node': 'catalog:',
                c8: 'catalog:',
                eslint: 'catalog:',
                mocha: 'catalog:',
                'mocha-chain': 'catalog:',
                typescript: 'catalog:',
            },
        });
        expect(readWritten(tree, 'packages/my-lib/tsconfig.json')).to.deep.equal({
            extends: '@leyman/configs/tsconfig.build.json',
            compilerOptions: {
                outDir: 'dist',
                rootDir: 'src',
                tsBuildInfoFile: 'dist/tsconfig.tsbuildinfo',
            },
            include: ['src'],
        });
        expect(readWritten(tree, 'packages/my-lib/test/tsconfig.json')).to.deep.equal({
            extends: '@leyman/configs/tsconfig.test.json',
            references: [{ path: '..' }],
        });
        expect(read(tree, 'packages/my-lib/src/index.ts')).to.include(
            "export const packageName = 'my-lib';"
        );
        expect(read(tree, 'packages/my-lib/test/unit/index.spec.ts'))
            .to.include("from 'mocha-chain'")
            .and.include("from 'my-lib'");
        expect(read(tree, 'packages/my-lib/eslint.config.js')).to.include(
            "from '@leyman/eslint-config'"
        );
        expect(read(tree, 'packages/my-lib/README.md')).to.equal('# my-lib\n\nDoes things.\n');
        expect(tree.exists('packages/my-lib/LICENSE')).to.equal(false);
        // No Nx installed to point at
        expect(readWritten(tree, 'packages/my-lib/project.json')).to.deep.equal({
            name: 'my-lib',
            targets: {
                biome: {},
                eslint: {},
                'update-ts-references': {},
                tsc: {},
                'tsc-test': {},
                'mocha-unit-test': {},
                'coverage-report': {},
            },
        });
    });

    withTree.test('Adds a published package on its support floor', async ({ tree }) => {
        tree.write('LICENSE', 'MIT License');
        tree.write('node_modules/nx/package.json', '{}');

        await packageGenerator(tree, {
            directory: 'packages/pub',
            name: '@scope/pub',
            description: 'Published.',
            published: true,
            floor: 24,
            test: 'vitest',
            repository: 'git+https://github.com/owner/repo.git',
            author: 'Someone',
            license: 'MIT',
            devDependencies: ['typescript', 'vitest'],
            skipInstall: true,
        });

        const packageJson = readWritten(tree, 'packages/pub/package.json');
        expect(packageJson).to.include({
            name: '@scope/pub',
            author: 'Someone',
            license: 'MIT',
            homepage: 'https://github.com/owner/repo/tree/main/packages/pub#readme',
        });
        expect(packageJson).to.not.have.property('private');
        expect(packageJson.engines).to.deep.equal({ node: '>=24' });
        expect(packageJson.repository).to.deep.equal({
            type: 'git',
            url: 'git+https://github.com/owner/repo.git',
            directory: 'packages/pub',
        });
        expect(packageJson.bugs).to.deep.equal({ url: 'https://github.com/owner/repo/issues' });
        expect(packageJson.devDependencies).to.include({
            '@types/node': 'catalog:node-24',
            typescript: 'catalog:',
            vitest: 'catalog:',
        });
        expect(packageJson.devDependencies).to.not.have.property('mocha');
        expect(readWritten(tree, 'packages/pub/tsconfig.json').extends).to.equal(
            '@leyman/configs/tsconfig.node-24.json'
        );
        expect(read(tree, 'packages/pub/test/unit/index.spec.ts')).to.include("from 'vitest'");
        expect(read(tree, 'packages/pub/LICENSE')).to.equal('MIT License');
        const projectJson = readWritten(tree, 'packages/pub/project.json');
        expect(projectJson.$schema).to.equal('../../node_modules/nx/schemas/project-schema.json');
        expect(Object.keys(projectJson.targets)).to.deep.equal([
            'biome',
            'eslint',
            'check-package',
            'update-ts-references',
            'tsc',
            'tsc-test',
            'vitest-unit-test',
            'coverage-report',
        ]);
    });

    withTree.test(
        "Takes @types/node of a floor without a catalog by the floor's major",
        async ({ tree }) => {
            updateNxJson(tree, { plugins: ['@nx/js', '@leyman/nx-plugin'] });

            await packageGenerator(tree, {
                directory: 'packages/pub',
                description: 'Published.',
                published: true,
                test: 'none',
                skipInstall: true,
            });

            const packageJson = readWritten(tree, 'packages/pub/package.json');
            expect(packageJson.devDependencies['@types/node']).to.equal('^22.0.0');
            expect(packageJson.devDependencies).to.not.have.property('c8');
            expect(packageJson).to.not.have.property('repository');
            expect(tree.exists('packages/pub/test')).to.equal(false);
            expect(
                Object.keys(readWritten(tree, 'packages/pub/project.json').targets)
            ).to.deep.equal(['biome', 'eslint', 'check-package', 'update-ts-references', 'tsc']);
        }
    );

    withTree.test(
        'Takes the options from a file, and versions from the workspace',
        async ({ tree }) => {
            tree.delete('pnpm-workspace.yaml');
            updateNxJson(tree, {});
            writeJson(tree, 'tools/nx-plugin.json', {
                targets: { biome: { name: 'format' }, tsc: false },
                checkPackage: { floorTsconfig: false },
            });
            // A URL is not a path to follow
            writeJson(tree, 'packages/a/project.json', {
                $schema: 'https://example.com/schema.json',
                name: 'a',
            });
            writeJson(tree, 'packages/b/project.json', {
                $schema: '../../tools/nx/schemas/project-schema.json',
                name: 'b',
            });
            writeJson(tree, 'packages/b/package.json', {
                name: '@leyman/configs',
                devDependencies: {
                    '@biomejs/biome': '^2.1.0',
                    '@leyman/eslint-config': 'workspace:^',
                    '@swc/cli': '*',
                    '@swc/core': '*',
                    '@types/node': '*',
                    eslint: '*',
                    typescript: '*',
                },
            });
            writeJson(tree, 'packages/c/package.json', {
                name: '@leyman/eslint-config',
                dependencies: { '@biomejs/biome': '^2.2.0' },
            });
            writeJson(tree, 'packages/c/project.json', { name: 'c' });

            await packageGenerator(tree, {
                directory: 'packages/new',
                description: 'New.',
                published: true,
                test: 'none',
                config: 'tools/nx-plugin.json',
                skipInstall: true,
            });

            expect(readWritten(tree, 'packages/new/package.json').devDependencies).to.deep.equal({
                '@biomejs/biome': '^2.1.0',
                '@leyman/configs': 'workspace:^',
                '@leyman/eslint-config': 'workspace:^',
                '@swc/cli': '*',
                '@swc/core': '*',
                '@types/node': '^22.0.0',
                eslint: '*',
                typescript: '*',
            });
            expect(readWritten(tree, 'packages/new/tsconfig.json').extends).to.equal(
                '@leyman/configs/tsconfig.build.json'
            );
            expect(readWritten(tree, 'packages/new/project.json')).to.deep.equal({
                $schema: '../../tools/nx/schemas/project-schema.json',
                name: 'new',
                targets: {
                    format: {},
                    eslint: {},
                    // Inferred from the files, whatever the options say of tsc
                    'check-package': {},
                    'update-ts-references': {},
                },
            });
        }
    );

    withTree.test('Fails on a dependency without a version', async ({ tree }) => {
        tree.write('pnpm-workspace.yaml', '');
        tree.delete('nx.json');

        await expect(
            packageGenerator(tree, {
                directory: 'packages/x',
                description: 'X.',
                skipInstall: true,
            })
        ).to.eventually.be.rejectedWith(
            'No version of @biomejs/biome in the workspace: add it to the pnpm catalog or to a package first'
        );
    });

    withTree.test('Fails on a directory holding a project', async ({ tree }) => {
        writeJson(tree, 'packages/x/project.json', { name: 'x' });

        await expect(
            packageGenerator(tree, { directory: 'packages/x', description: 'X.' })
        ).to.eventually.be.rejectedWith('packages/x already holds a project');
    });

    withTree.test('Fails on invalid plugin options', async ({ tree }) => {
        updateNxJson(tree, { plugins: ['@leyman/nx-plugin'] });
        writeJson(tree, 'nx-plugin.json', { unknown: true });

        await expect(
            packageGenerator(tree, {
                directory: 'packages/x',
                description: 'X.',
                config: 'nx-plugin.json',
            })
        ).to.eventually.be.rejectedWith(/^Invalid @leyman\/nx-plugin options in nx-plugin\.json/v);
    });
});
