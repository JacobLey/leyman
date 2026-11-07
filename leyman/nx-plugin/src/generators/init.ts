import type { GeneratorCallback, PluginConfiguration, Tree } from '@nx/devkit';
import type { TargetName } from '../lib/options.js';
import { lstat, mkdir, symlink } from 'node:fs/promises';
import Path from 'node:path';
import { installPackagesTask, readJson, readNxJson, runTasksInSerial, writeJson } from '@nx/devkit';
import { parseDocument, stringify } from 'yaml';
import { resolveOptions } from '../lib/options.js';
import { name as pluginName } from '../lib/plugin.js';
import { assertOptions } from '../lib/schema.js';
import { readWorkspaceVersions, resolveVersion } from '../lib/versions.js';

/**
 * What the `init` generator sets up.
 */
export interface InitGeneratorOptions {
    /**
     * Wire the targets' order with nx-lifecycle.
     *
     * @default true
     */
    readonly lifecycle?: boolean;
    /**
     * Link the principles skill `@leyman/configs` ships into `.agents/skills/principles`, and `.claude/skills` to
     * `.agents/skills`, so coding agents read the principles of the version installed.
     *
     * @default true
     */
    readonly skill?: boolean;
    /**
     * Don't install dependencies afterwards.
     *
     * @default false
     */
    readonly skipInstall?: boolean;
}

/**
 * The stages the plugin's targets run in, as nx-lifecycle options: install, prepare (generate, format), check (lint),
 * build (run, post, sync), test (compile, run, report) and verify.
 */
export const lifecycleStages = {
    install: { dependsOn: ['^build'] },
    prepare: { hooks: ['generate', 'format'], dependsOn: ['install'] },
    check: { hooks: ['lint'], dependsOn: ['^build', 'prepare', 'build'] },
    build: { hooks: ['run', 'post', 'sync'], dependsOn: ['^build', 'prepare'] },
    test: { hooks: ['compile', 'run', 'report'], dependsOn: ['build'] },
    verify: { dependsOn: ['check', 'test'] },
} as const;

/**
 * The stage hook each of the plugin's targets is bound to.
 */
export const lifecycleBindings = {
    biome: 'prepare:format',
    eslint: 'check:lint',
    'check-package': 'check:lint',
    'update-ts-references': 'prepare:generate',
    tsc: 'build:run',
    'tsc-test': 'test:compile',
    'mocha-unit-test': 'test:run',
    'mocha-integration-test': 'test:run',
    'vitest-unit-test': 'test:run',
    'coverage-report': 'test:report',
    'sync-injected': 'build:sync',
} as const satisfies Record<TargetName, string>;

const lifecyclePlugin = 'nx-lifecycle/plugin';

/**
 * Packages the workspace root installs: Nx resolves plugins from it, and the targets run check-package, `tsc` and Nx's
 * TypeScript sync generator from it.
 */
const rootDependencies = [
    pluginName,
    '@biomejs/biome',
    '@leyman/check-package',
    '@leyman/configs',
    '@nx/js',
    '@typescript/native',
] as const;

/**
 * Packages whose install scripts pnpm needs a decision on. Neither needs it: each installs its platform's native binary
 * as an optional dependency.
 */
const skippedBuilds = ['@swc/core', 'nx'] as const;

/**
 * The principles skill `@leyman/configs` ships, linked where coding agents read skills: `.agents/skills` for most,
 * `.claude/skills` (a link to it) for Claude Code.
 */
const skillLinks = [
    {
        path: '.agents/skills/principles',
        target: '../../node_modules/@leyman/configs/skills/principles',
    },
    { path: '.claude/skills', target: '../.agents/skills' },
] as const;

const linkSkills = async (root: string): Promise<void> => {
    for (const { path, target } of skillLinks) {
        const absolute = Path.join(root, path);
        try {
            // Anything already there is the workspace's own: a directory of skills, or a link it chose
            await lstat(absolute);
        } catch {
            await mkdir(Path.dirname(absolute), { recursive: true });
            await symlink(target, absolute);
        }
    }
};

const pluginOf = (entry: PluginConfiguration): string =>
    typeof entry === 'string' ? entry : entry.plugin;

const injectSettings = `# Install workspace dependencies as copies of their published files, like a package from the registry.
# Builds keep the copies current (\`sync-injected\`).
injectWorkspacePackages: true
`;
const dedupeSettings = `# Otherwise pnpm symlinks to the source again whenever peers allow it
dedupeInjectedDeps: false
`;

/**
 * What the targets write that is never committed: installs, build and test output, coverage, what `sync-injected`
 * records, and Nx's cache.
 */
const ignoredPaths = [
    'node_modules',
    'dist',
    'dist-test',
    '/.coverage',
    '/.package-surface',
    '/.nx/cache',
    '/.nx/workspace-data',
] as const;

/**
 * Adds each of {@link ignoredPaths} that `.gitignore` lacks, creating it if need be. check-package reads it too, for
 * the files a package doesn't publish.
 *
 * @param tree - Nx's view of the files
 */
const ignoreOutputs = (tree: Tree): void => {
    const gitignore = tree.read('.gitignore', 'utf8') ?? '';
    const lines = new Set(gitignore.split('\n').map(line => line.trim()));
    const missing = ignoredPaths.filter(path => !lines.has(path));
    if (missing.length === 0) {
        return;
    }
    const separator = gitignore === '' || gitignore.endsWith('\n') ? '' : '\n';
    const added = missing.map(path => `${path}\n`).join('');
    tree.write('.gitignore', `${gitignore}${separator}${added}`);
};

/**
 * Sets `pnpm-workspace.yaml` up, leaving alone what it sets already: has pnpm install workspace packages as copies,
 * which `sync-injected` keeps current (`injectWorkspacePackages` and `dedupeInjectedDeps`), and skip the install
 * scripts of the packages the targets run, which it otherwise fails on (`allowBuilds`).
 *
 * @param tree - Nx's view of the files
 */
const configurePnpm = (tree: Tree): void => {
    const yaml = tree.read('pnpm-workspace.yaml', 'utf8');
    if (yaml === null) {
        return;
    }
    const document = parseDocument(yaml);
    const missingBuilds = skippedBuilds.filter(name => !document.hasIn(['allowBuilds', name]));
    const hasAllowBuilds = document.has('allowBuilds');
    let updated = yaml;
    if (hasAllowBuilds && missingBuilds.length > 0) {
        for (const name of missingBuilds) {
            document.setIn(['allowBuilds', name], false);
        }
        updated = document.toString({ singleQuote: true });
    }
    const allowBuilds = Object.fromEntries(missingBuilds.map(name => [name, false]));
    const added = [
        ...(document.has('injectWorkspacePackages') ? [] : [injectSettings]),
        ...(document.has('dedupeInjectedDeps') ? [] : [dedupeSettings]),
        ...(hasAllowBuilds
            ? []
            : [
                  `# Install scripts of the packages the targets run, which they don't need\n${stringify(
                      { allowBuilds },
                      { singleQuote: true }
                  )}`,
              ]),
    ];
    if (updated === yaml && added.length === 0) {
        return;
    }
    const separator = updated === '' || updated.endsWith('\n') ? '' : '\n';
    tree.write('pnpm-workspace.yaml', `${updated}${separator}${added.join('')}`);
};

/**
 * Nx generator setting an Nx workspace up for the plugin: adds it (and nx-lifecycle, with stages and bindings for its
 * targets) to `nx.json`, installs it and the tools its targets run at the root, extends the shared Biome config, writes
 * a root `tsconfig.json`, has pnpm inject workspace packages and skip install scripts the targets don't need, ignores
 * what the targets write in `.gitignore`, and points coding agents at the principles. Run by `nx add @leyman/nx-plugin`.
 * Leaves alone what is already set.
 *
 * @param tree - Nx's view of the files
 * @param options - what to set up
 * @returns the task installing dependencies, unless `skipInstall`
 * @rejects {Error} when the plugin's options in `nx.json` are invalid
 */
const initGenerator = async (
    tree: Tree,
    options: InitGeneratorOptions = {}
): Promise<GeneratorCallback | undefined> => {
    const { lifecycle = true, skill = true } = options;
    const nxJson = readNxJson(tree) ?? {};
    const plugins = [...(nxJson.plugins ?? [])];
    const existing = plugins.find(entry => pluginOf(entry) === pluginName);
    if (existing === undefined) {
        // The package generator writes ESM-only packages
        plugins.push({ plugin: pluginName, options: { checkPackage: { profile: 'esm-only' } } });
    }
    const pluginOptions: unknown = typeof existing === 'object' ? (existing.options ?? {}) : {};
    assertOptions(pluginOptions, 'nx.json');
    const resolved = resolveOptions(pluginOptions);
    if (lifecycle && plugins.every(entry => pluginOf(entry) !== lifecyclePlugin)) {
        const bindings = Object.entries(lifecycleBindings).flatMap(
            ([target, hook]): [string, string][] => {
                const targetOptions = resolved.targets[target as TargetName];
                return targetOptions === false ? [] : [[targetOptions.name, hook]];
            }
        );
        plugins.push({
            plugin: lifecyclePlugin,
            options: {
                stages: lifecycleStages,
                bindings: Object.fromEntries(bindings),
                // Bound for every target the plugin has, before any project defines them
                warnUnusedBindings: false,
            },
        });
    }
    writeJson(tree, 'nx.json', { ...nxJson, plugins });

    const versions = await readWorkspaceVersions(tree);
    const packageJson = readJson<{ devDependencies?: Record<string, string> }>(
        tree,
        'package.json'
    );
    const devDependencies = { ...packageJson.devDependencies };
    for (const dependency of [...rootDependencies, ...(lifecycle ? ['nx-lifecycle'] : [])]) {
        devDependencies[dependency] ??= resolveVersion(dependency, versions);
    }
    writeJson(tree, 'package.json', { ...packageJson, devDependencies });

    if (!tree.exists('biome.json') && !tree.exists('biome.jsonc')) {
        writeJson(tree, 'biome.json', {
            $schema: './node_modules/@biomejs/biome/configuration_schema.json',
            extends: ['@leyman/configs/biome.base.json'],
        });
    }
    // Nx's TypeScript sync generator keeps its references to every package
    if (!tree.exists('tsconfig.json')) {
        writeJson(tree, 'tsconfig.json', { files: [], references: [] });
    }
    configurePnpm(tree);
    ignoreOutputs(tree);

    const tasks: GeneratorCallback[] = [
        ...(options.skipInstall === true ? [] : [installPackagesTask.bind(undefined, tree)]),
        // Nx's tree can't hold a link, so the links are made on disk once it is written
        ...(skill ? [linkSkills.bind(undefined, tree.root)] : []),
    ];
    return tasks.length === 0 ? undefined : runTasksInSerial(...tasks);
};
export default initGenerator;
