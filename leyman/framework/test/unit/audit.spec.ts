import type { AuditReport, CheckResult } from '@leyman/framework';
import type { Files } from '../lib/repo.js';
import { mkdir } from 'node:fs/promises';
import Path from 'node:path';
import { expect } from '@leyman/expect';
import { audit } from '@leyman/framework';
import { afterEach, suite, test } from 'mocha-chain';
import { writeRepo } from '../lib/repo.js';

const latestVersion = async (name: string): Promise<string | undefined> =>
    name === '@leyman/configs' ? '0.2.0' : undefined;

const problemsOf = (report: AuditReport): Record<string, readonly string[]> =>
    Object.fromEntries(
        report.checks
            .filter(({ problems }) => problems.length > 0)
            .map(({ id, problems }) => [id, problems])
    );

suite('audit', () => {
    const removes: (() => Promise<void>)[] = [];
    const tracked = async (files: Files, base?: Files): Promise<string> => {
        const repo = await writeRepo(files, base);
        removes.push(repo.remove);
        return repo.root;
    };
    const auditRepo = async (files: Files, base?: Files): Promise<AuditReport> =>
        audit({ cwd: await tracked(files, base), latestVersion });

    afterEach(async () => {
        await Promise.all(removes.splice(0).map(async remove => remove()));
    });

    test('Meets every tier', async () => {
        const report = await auditRepo({});

        expect(problemsOf(report)).to.deep.equal({});
        expect(report.tier).to.equal(4);
        expect(report.checks.map(({ tier }) => tier)).to.deep.equal(
            report.checks.map(({ tier }) => tier).toSorted((a, b) => a - b)
        );
    });

    test('Meets no tier in a repository with nothing', async () => {
        const report = await auditRepo(
            {
                'package.json': { name: 'solo', engines: { node: '>=24' } },
                'tsconfig.json': { extends: './base.json' },
                'CLAUDE.md': null,
            },
            {}
        );

        expect(report.tier).to.equal(0);
        expect(problemsOf(report)).to.deep.equal({
            'eslint-config': ['.: no eslint.config.js'],
            'check-package': ['.: nothing runs check-package'],
            tsconfig: [".: tsconfig.json doesn't extend @leyman/configs"],
            biome: ['No biome.json at the root'],
            'nx-plugin': ['nx.json has no @leyman/nx-plugin plugin'],
            lifecycle: ['nx.json has no nx-lifecycle plugin, and no project has a lifecycle.json'],
            inject: ['No pnpm-workspace.yaml: the targets assume pnpm'],
            'project-json': ['.: no targets in project.json'],
            devcontainer: ['No .devcontainer/devcontainer.json'],
            ci: ['No Dagger module (dagger.json)', 'No GitHub Actions workflow'],
            agents: [
                'No AGENTS.md',
                "CLAUDE.md isn't a link to AGENTS.md",
                'No skills in .claude/skills',
            ],
        });
    });

    test('Reports the tier before the first failing one', async () => {
        const report = await auditRepo({ '.devcontainer/devcontainer.json': null });

        expect(report.tier).to.equal(3);
    });

    test("Finds packages that don't lint with the shared config", async () => {
        const report = await auditRepo({ 'eslint.config.js': 'export default [];\n' });

        expect(problemsOf(report)).to.deep.equal({
            'eslint-config': ["packages/pub: eslint.config.js doesn't use @leyman/eslint-config"],
        });
    });

    test('Accepts check-package from a script', async () => {
        const report = await auditRepo({
            'packages/pub/project.json': { targets: { tsc: {} } },
            'packages/pub/package.json': {
                name: 'pub',
                engines: { node: '>=22' },
                devDependencies: { '@leyman/configs': '^0.1.0' },
                scripts: { lint: 'check-package --profile esm-only' },
            },
        });

        expect(problemsOf(report)).to.deep.equal({});
    });

    suite('versions', () => {
        test('Finds packages behind npm', async () => {
            const report = await auditRepo({
                'packages/pub/node_modules/@leyman/configs/package.json': { version: '0.1.9' },
            });

            expect(problemsOf(report)).to.deep.equal({
                versions: ['@leyman/configs: 0.1.9 installed, 0.2.0 on npm'],
            });
        });

        test('Accepts versions ahead of npm, and packages npm lacks', async () => {
            const report = await auditRepo({
                'node_modules/@leyman/configs/package.json': { version: '0.2.0-next.1' },
                'node_modules/nx-lifecycle/package.json': { version: '0.0.1' },
                'packages/pub/node_modules/@leyman/configs/package.json': { version: '0.10.0' },
            });

            expect(problemsOf(report)).to.deep.equal({});
        });

        const skipped = async (
            latest: false | (() => Promise<string>)
        ): Promise<CheckResult | undefined> => {
            const report = await audit({ cwd: await tracked({}), latestVersion: latest });
            expect(report.tier).to.equal(4);
            return report.checks.find(({ id }) => id === 'versions');
        };

        test('Skips offline', async () => {
            expect(await skipped(false)).to.include({ skipped: 'offline' });
        });

        test('Skips when the registry fails', async () => {
            const check = await skipped(async () => {
                throw new Error('Down');
            });
            expect(check).to.include({ skipped: "npm's registry: Down" });
        });
    });

    test('Finds configs that miss the shared ones', async () => {
        const report = await auditRepo({
            'packages/pub/tsconfig.json': { extends: ['@leyman/configs/tsconfig.node-24.json'] },
            'packages/private/package.json': { name: 'private', private: true },
            'biome.json': null,
            'biome.jsonc': '{ "extends": ["./other.json"] }',
            'nx.json': {
                plugins: [
                    '@leyman/other',
                    { plugin: '@leyman/nx-plugin', options: { coverage: { branches: 90 } } },
                    { plugin: 'nx-lifecycle/plugin' },
                ],
            },
            'packages/private/.c8rc.json': { 'check-coverage': false, lines: '80' },
            'packages/data/package.json': {
                name: 'data',
                private: true,
                c8: { checkCoverage: false },
            },
            'packages/data/.c8rc': '[]',
        });

        expect(problemsOf(report)).to.deep.equal({
            tsconfig: [
                "packages/private: @leyman/configs isn't installed",
                "packages/pub: engines.node is >=22, but tsconfig.json doesn't extend @leyman/configs/tsconfig.node-22.json",
            ],
            biome: ["biome.json doesn't extend @leyman/configs/biome.base.json"],
            coverage: [
                'nx.json @leyman/nx-plugin coverage: branches at 90%',
                'packages/data/package.json c8: turns check-coverage off',
                'packages/private/.c8rc.json: turns check-coverage off',
            ],
        });
    });

    test("Skips the floor of a package that doesn't name one", async () => {
        const report = await auditRepo({
            'packages/pub/package.json': {
                name: 'pub',
                engines: { node: '^22 || ^24' },
                devDependencies: { '@leyman/configs': '^0.1.0' },
            },
        });

        expect(problemsOf(report)).to.deep.equal({});
    });

    test('Accepts the executors of the plugin and lifecycle', async () => {
        const report = await auditRepo({
            'nx.json': {},
            'packages/data/project.json': {
                targets: { targets: { executor: '@leyman/nx-plugin:targets' }, run: {} },
            },
            'packages/data/lifecycle.json': {},
        });

        expect(problemsOf(report)).to.deep.equal({});
    });

    test('Finds gaps in the Nx setup', async () => {
        const report = await auditRepo({
            'nx.json': null,
            'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
            'packages/ignored/package.json': null,
            'packages/data/project.json': { targets: {} },
            'packages/private/project.json': null,
        });

        expect(problemsOf(report)).to.deep.equal({
            'nx-plugin': ['nx.json has no @leyman/nx-plugin plugin'],
            lifecycle: ['nx.json has no nx-lifecycle plugin, and no project has a lifecycle.json'],
            inject: ["injectWorkspacePackages isn't true", "dedupeInjectedDeps isn't false"],
            'project-json': [
                'packages/data: no targets in project.json',
                'packages/private: no targets in project.json',
            ],
        });
    });

    test('Finds images without a digest', async () => {
        const report = await auditRepo({
            '.devcontainer/Dockerfile': `ARG VERSION="24"\nFROM node:\${VERSION}\nFROM $OTHER\n`,
            '.devcontainer/empty-compose.yml': '',
            '.devcontainer/build.compose.yaml': 'services:\n  a: null\n  b:\n    build: .\n',
            '.devcontainer/docker-compose.yml': `services:\n  a:\n    image: valkey:9\n  b:\n    image: \${IMAGE:-postgres:18}\n`,
        });

        expect(problemsOf(report)).to.deep.equal({
            'images-pinned': [
                '.devcontainer/Dockerfile: node:24',
                '.devcontainer/Dockerfile: $OTHER',
                '.devcontainer/docker-compose.yml: valkey:9',
                '.devcontainer/docker-compose.yml: postgres:18',
            ],
        });
    });

    test('Finds workarounds without a note', async () => {
        const report = await auditRepo({
            'package.json': { name: 'workspace', private: true, pnpm: { overrides: {} } },
            'packages/ignored/package.json': null,
            'pnpm-workspace.yaml': `packages:
  - packages/*
injectWorkspacePackages: true
dedupeInjectedDeps: false
overrides:
  a: '1'
  # Until b 2
  b: '1'
  c: '1'

  d: '1'
packageExtensions: []
peerDependencyRules:
  # The rules of this section
  allowedVersions:
    e: '1'
  ignoreMissing:
    f: '1'
`,
        });

        expect(problemsOf(report)).to.deep.equal({
            workarounds: [
                "package.json pnpm.overrides: can't hold a note, move it to pnpm-workspace.yaml",
                'overrides: a',
                'overrides: d',
                'peerDependencyRules.ignoreMissing: f',
            ],
        });
    });

    test("Accepts the root's skills and links", async () => {
        const report = await auditRepo({ 'CLAUDE.md': '# Not a link\n' });

        expect(problemsOf(report)).to.deep.equal({
            agents: ["CLAUDE.md isn't a link to AGENTS.md"],
        });
    });

    test('Reads package.json workspaces', async () => {
        const base = await auditRepo({
            'pnpm-workspace.yaml': null,
            'package.json': { name: 'workspace', private: true, workspaces: ['packages/pub'] },
        });
        const packagesKey = await auditRepo({
            'pnpm-workspace.yaml': null,
            'package.json': {
                name: 'workspace',
                private: true,
                workspaces: { packages: ['packages/private'] },
            },
        });
        const empty = await auditRepo({ 'pnpm-workspace.yaml': '' });
        const neither = await auditRepo({
            'pnpm-workspace.yaml': 'injectWorkspacePackages: true\n',
            'package.json': { name: 'workspace', private: true },
        });

        expect(problemsOf(base)['project-json']).to.equal(undefined);
        expect(problemsOf(packagesKey)['check-package']).to.equal(undefined);
        expect(problemsOf(empty).inject).to.have.length(2);
        expect(problemsOf(neither)['project-json']).to.deep.equal([
            '.: no targets in project.json',
        ]);
    });

    test('Defaults to the working directory and npm', async () => {
        const root = await tracked({
            'node_modules/@leyman/configs/package.json': null,
            'packages/pub/node_modules/@leyman/configs/package.json': null,
        });
        const cwd = process.cwd();
        process.chdir(root);
        try {
            const report = await audit();
            expect(report).to.include({ root, tier: 4 });
        } finally {
            process.chdir(cwd);
        }
    });

    test('Rejects without a package.json', async () => {
        const root = await tracked({}, {});

        await expect(audit({ cwd: root })).to.eventually.be.rejectedWith(
            /^No package\.json in .*: run the audit from a repository's root$/v
        );
    });

    test('Fails on a file it cannot read', async () => {
        const root = await tracked({ 'biome.json': null });
        await mkdir(Path.join(root, 'biome.json'));

        await expect(audit({ cwd: root, latestVersion: false })).to.eventually.be.rejectedWith(
            /EISDIR/v
        );
    });
});
