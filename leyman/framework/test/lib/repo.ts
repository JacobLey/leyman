import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import Os from 'node:os';
import Path from 'node:path';

/**
 * Each file of a repository by its path: text as is, anything else as JSON, `null` to leave it out.
 */
export type Files = Readonly<Record<string, unknown>>;

const tsconfig = (floor: number): string =>
    `{
    // Comments and trailing commas, as tsconfig.json allows
    "extends": "@leyman/configs/tsconfig.node-${floor}.json",
}`;

/**
 * A repository that meets every tier: one published package and one private one.
 */
export const fullRepo: Files = {
    'package.json': {
        name: 'workspace',
        private: true,
        devDependencies: { '@leyman/check-package': '^0.1.0' },
    },
    'pnpm-workspace.yaml': `packages:
  - packages/*
  - '!packages/ignored'
injectWorkspacePackages: true
dedupeInjectedDeps: false
# Drop once upstream fixes it: example/issue#1
patchedDependencies:
  a: patches/a.patch
  b: patches/b.patch

peerDependencyRules:
  allowedVersions:
    c>d: '2' # Until c declares d 2
`,
    'nx.json': {
        plugins: [
            { plugin: '@leyman/nx-plugin', options: { coverage: { lines: 100 } } },
            'nx-lifecycle/plugin',
        ],
    },
    'biome.json': { extends: ['@leyman/configs/biome.base.json'] },
    'eslint.config.js': "export { default } from '@leyman/eslint-config';\n",
    'tsconfig.json': { files: [], references: [] },
    'packages/pub/package.json': {
        name: 'pub',
        engines: { node: '>=22' },
        devDependencies: { '@leyman/configs': '^0.1.0' },
        c8: { lines: 100 },
    },
    'packages/pub/tsconfig.json': tsconfig(22),
    'packages/pub/project.json': { targets: { tsc: {}, 'check-package': {} } },
    'packages/pub/src/index.ts':
        '// eslint-disable-next-line no-console -- An example\nconsole.log(1);\n',
    'packages/private/package.json': {
        name: 'private',
        private: true,
        dependencies: { '@leyman/configs': '^0.1.0' },
        scripts: { check: 'echo' },
    },
    'packages/private/tsconfig.json': { extends: '@leyman/configs/tsconfig.build.json' },
    'packages/private/project.json': { targets: { tsc: {} } },
    'packages/private/eslint.config.mjs': "export { default } from '@leyman/eslint-config';\n",
    'packages/private/.c8rc.json': { branches: 100 },
    'packages/data/package.json': { name: 'data', private: true },
    'packages/data/project.json': { targets: { build: {} } },
    'packages/ignored/package.json': { name: 'ignored' },
    'node_modules/@leyman/configs/package.json': { version: '0.2.0' },
    'packages/pub/node_modules/@leyman/configs/package.json': { version: '0.2.0' },
    '.devcontainer/devcontainer.json': {},
    '.devcontainer/Dockerfile': `ARG BASE=debian:13@sha256:abc
ARG UNUSED
FROM \${BASE} AS base
FROM --platform=linux/amd64 node:24@sha256:def AS node
FROM base
FROM scratch
`,
    '.devcontainer/docker-compose.yml': `services:
  db:
    image: "postgres:18@sha256:123"
`,
    'dagger/dagger.json': {},
    '.github/workflows/ci.yml': 'on: push\n',
    'AGENTS.md': '# Agents\n',
    '.claude/skills/principles/SKILL.md': '# Principles\n',
};

/**
 * Writes a repository to a new temporary directory. `CLAUDE.md` is a link to `AGENTS.md` unless the files set it.
 *
 * @param files - each file, over {@link fullRepo} when `base` is it
 * @param base - the files to start from
 * @returns its root, and a function to remove it
 */
export const writeRepo = async (
    files: Files,
    base: Files = fullRepo
): Promise<{ root: string; remove: () => Promise<void> }> => {
    const root = await mkdtemp(Path.join(Os.tmpdir(), 'framework-audit-'));
    const merged: Files = { 'CLAUDE.md': Symbol.for('link'), ...base, ...files };
    for (const [path, content] of Object.entries(merged)) {
        if (content === null) {
            continue;
        }
        const absolute = Path.join(root, path);
        await mkdir(Path.dirname(absolute), { recursive: true });
        if (content === Symbol.for('link')) {
            if (merged['AGENTS.md'] !== null) {
                await symlink('AGENTS.md', absolute);
            }
        } else {
            await writeFile(
                absolute,
                typeof content === 'string' ? content : JSON.stringify(content)
            );
        }
    }
    return { root, remove: async () => rm(root, { recursive: true, force: true }) };
};
