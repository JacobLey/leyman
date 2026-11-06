import type { GeneratorCallback, PluginConfiguration, Tree } from '@nx/devkit';
import type { TargetName } from '../lib/options.js';
import { installPackagesTask, readJson, readNxJson, writeJson } from '@nx/devkit';
import { parse } from 'yaml';
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
     * Write a `.claude/skills/principles/SKILL.md` pointing coding agents at the principles behind the setup.
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
 * Packages the workspace root installs: Nx resolves plugins from it, and the targets run check-package and Nx's
 * TypeScript sync generator from it.
 */
const rootDependencies = [
    pluginName,
    '@biomejs/biome',
    '@leyman/check-package',
    '@leyman/configs',
    '@nx/js',
] as const;

const principlesSkill = `---
name: principles
description: The principles behind this setup (the bar for packages, versioning, support floors, dependencies, lint, generated content, patches, and how work is committed and verified), and why
---

# Principles

Read the [principles](https://jacobley.github.io/leyman/framework/principles) of the setup this workspace follows before a design, a review or an audit, and decide anything no other skill covers by them.
`;

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
 * Has pnpm install workspace packages as copies, which \`sync-injected\` keeps current: sets \`injectWorkspacePackages\`
 * and \`dedupeInjectedDeps\` at the end of \`pnpm-workspace.yaml\`, unless it sets them already.
 *
 * @param tree - Nx's view of the files
 */
const injectWorkspacePackages = (tree: Tree): void => {
    const yaml = tree.read('pnpm-workspace.yaml', 'utf8');
    if (yaml === null) {
        return;
    }
    const settings = (parse(yaml) ?? {}) as Record<string, unknown>;
    const added = [
        ...(Object.hasOwn(settings, 'injectWorkspacePackages') ? [] : [injectSettings]),
        ...(Object.hasOwn(settings, 'dedupeInjectedDeps') ? [] : [dedupeSettings]),
    ];
    if (added.length === 0) {
        return;
    }
    const separator = yaml === '' || yaml.endsWith('\n') ? '' : '\n';
    tree.write('pnpm-workspace.yaml', `${yaml}${separator}${added.join('')}`);
};

/**
 * Nx generator setting an Nx workspace up for the plugin: adds it (and nx-lifecycle, with stages and bindings for its
 * targets) to `nx.json`, installs it and the tools its targets run at the root, extends the shared Biome config, has
 * pnpm inject workspace packages, and points coding agents at the principles. Run by `nx add @leyman/nx-plugin`.
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
        plugins.push({ plugin: pluginName, options: {} });
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
            options: { stages: lifecycleStages, bindings: Object.fromEntries(bindings) },
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
    injectWorkspacePackages(tree);
    const skillPath = '.claude/skills/principles/SKILL.md';
    if (skill && !tree.exists(skillPath)) {
        tree.write(skillPath, principlesSkill);
    }

    return options.skipInstall === true ? undefined : installPackagesTask.bind(undefined, tree);
};
export default initGenerator;
