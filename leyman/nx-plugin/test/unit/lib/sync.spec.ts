import type { Context } from 'mocha';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import Os from 'node:os';
import Path from 'node:path';
import { expect } from '@leyman/expect';
import { syncTargets } from '@leyman/nx-plugin';
import { beforeEach, suite } from 'mocha-chain';

const writeFiles = async (root: string, files: Record<string, unknown>): Promise<void> => {
    for (const [path, content] of Object.entries(files)) {
        const file = Path.join(root, path);
        await mkdir(Path.dirname(file), { recursive: true });
        await writeFile(file, JSON.stringify(content));
    }
};

const readJson = async (root: string, path: string): Promise<Record<string, unknown>> =>
    JSON.parse(await readFile(Path.join(root, path), 'utf8')) as Record<string, unknown>;

const projects = [
    { name: 'a', root: 'packages/a' },
    { name: 'b', root: 'packages/b' },
    { name: 'c', root: 'packages/c' },
    { name: 'd', root: 'packages/d' },
];

suite('syncTargets', () => {
    const withWorkspace = beforeEach(async function (this: Context) {
        this.timeout(5000);
        const root = await mkdtemp(Path.join(Os.tmpdir(), 'nx-plugin-sync-'));
        await writeFiles(root, {
            'nx.json': {
                namedInputs: { 'shared-globals': [] },
                targetDefaults: {
                    tsc: { executor: 'stale', dependsOn: ['build:_'] },
                    other: { executor: 'nx:noop' },
                },
            },
            // Published, and a dependency of b
            'packages/a/package.json': { name: 'a', devDependencies: { mocha: '*' } },
            'packages/a/tsconfig.json': {},
            'packages/a/src/index.ts': {},
            'packages/a/test/tsconfig.json': {},
            'packages/a/test/unit/a.spec.ts': {},
            'packages/a/project.json': {
                name: 'a',
                targets: { barrelify: {}, tsc: {}, 'install:_': {} },
            },
            'packages/b/package.json': {
                name: 'b',
                private: true,
                dependencies: { a: 'workspace:^' },
            },
            'packages/b/project.json': {
                name: 'b',
                targets: {
                    biome: {},
                    tsc: {},
                    'check-package': { options: { commands: ['kept'] } },
                },
            },
            // No project.json: nothing to declare
            'packages/c/package.json': { name: 'c' },
            // No package.json: only formatted
            'packages/d/project.json': { name: 'd' },
        });
        return { root };
    });
    withWorkspace.afterEach(async ({ root }) => {
        await rm(root, { recursive: true, force: true });
    });

    withWorkspace.test(
        'Writes the named inputs and target defaults, keeping dependsOn',
        async ({ root }) => {
            const written = await syncTargets({
                root,
                projects,
                options: { targets: { biome: { name: 'format' }, 'sync-injected': false } },
                optionsSource: 'test',
                check: false,
            });

            expect(written.map(path => Path.relative(root, path))).to.deep.equal([
                'nx.json',
                'packages/a/project.json',
                'packages/b/project.json',
                'packages/d/project.json',
            ]);
            const nxJson = await readJson(root, 'nx.json');
            const namedInputs = nxJson.namedInputs as Record<string, unknown>;
            const targetDefaults = nxJson.targetDefaults as Record<string, Record<string, unknown>>;
            expect(Object.keys(namedInputs)).to.deep.equal([
                'shared-globals',
                'dependency-files',
                'package-files',
                'eslint-input',
                'ts-source',
                'dependency-builds',
                'test-source',
            ]);
            expect(Object.keys(targetDefaults)).to.deep.equal([
                'tsc',
                'other',
                'format',
                'eslint',
                'check-package',
                'update-ts-references',
                'tsc-test',
                'mocha-unit-test',
                'mocha-integration-test',
                'vitest-unit-test',
                'coverage-report',
            ]);
            expect(targetDefaults.tsc!.executor).to.equal('nx:run-commands');
            expect(targetDefaults.tsc!.dependsOn).to.deep.equal(['build:_']);
            expect(targetDefaults.format).to.not.have.property('dependsOn');
            expect(targetDefaults.other).to.deep.equal({ executor: 'nx:noop' });
        }
    );

    withWorkspace.test(
        'Declares the targets each project gets, in their order',
        async ({ root }) => {
            await syncTargets({ root, projects, options: {}, optionsSource: 'test', check: false });

            const a = await readJson(root, 'packages/a/project.json');
            const b = await readJson(root, 'packages/b/project.json');
            expect(Object.keys(a.targets!)).to.deep.equal([
                'biome',
                'check-package',
                'update-ts-references',
                'barrelify',
                'tsc',
                'tsc-test',
                'mocha-unit-test',
                'coverage-report',
                'sync-injected',
                'install:_',
            ]);
            expect(b.targets).to.deep.equal({
                biome: {},
                'check-package': { options: { commands: ['kept'] } },
            });
            expect(await readJson(root, 'packages/d/project.json')).to.deep.equal({
                name: 'd',
                targets: { biome: {} },
            });
        }
    );

    withWorkspace.test('Writes nothing once up to date', async ({ root }) => {
        await syncTargets({ root, projects, options: {}, optionsSource: 'test', check: false });

        expect(
            await syncTargets({ root, projects, options: {}, optionsSource: 'test', check: true })
        ).to.deep.equal([]);
    });

    withWorkspace.test('Fails rather than write in check mode', async ({ root }) => {
        await expect(
            syncTargets({ root, projects, options: {}, optionsSource: 'test', check: true })
        ).to.eventually.be.rejectedWith(
            'Not up to date with @leyman/nx-plugin; run its targets executor:\n- nx.json\n- packages/a/project.json'
        );
        const nxJson = await readJson(root, 'nx.json');
        expect(nxJson.targetDefaults).to.deep.equal({
            tsc: { executor: 'stale', dependsOn: ['build:_'] },
            other: { executor: 'nx:noop' },
        });
    });

    withWorkspace.test('Rejects invalid options', async ({ root }) => {
        await expect(
            syncTargets({
                root,
                projects,
                options: { targets: { tsc: { name: 1 } }, unknown: true },
                optionsSource: 'nx-plugin.json',
                check: false,
            })
        ).to.eventually.be.rejectedWith(
            /^Invalid @leyman\/nx-plugin options in nx-plugin\.json:\n- options/v
        );
    });
});
