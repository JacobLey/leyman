/* eslint-disable @typescript-eslint/no-magic-numbers -- Each check names its tier by the number the tiers page gives it */

import type { Document, Pair, Scalar, YAMLMap } from 'yaml';
import type { PackageJson, Workspace, WorkspacePackage } from './workspace.js';
import Path from 'node:path';
import { isMap, parse } from 'yaml';

/**
 * A tier of adoption, as the tiers page numbers them: checks, shared configs, the Nx plugin and lifecycle, and the
 * devcontainer, CI and skills.
 */
export type Tier = 1 | 2 | 3 | 4;

/**
 * The last tier, the whole setup.
 */
export const maxTier = 4;

/**
 * Every tier, in order.
 */
export const tiers: readonly Tier[] = [1, 2, 3, 4];

/**
 * What a check needs besides the workspace.
 */
export interface CheckContext {
    /**
     * The `latest` version of a package on npm, or `false` to skip what needs the network.
     */
    readonly latestVersion: false | ((name: string) => Promise<string | undefined>);
}

/**
 * The outcome of a check: each problem found, empty when it passes, or why it was skipped.
 */
export type CheckOutcome = readonly string[] | { readonly skipped: string };

/**
 * One thing a tier needs, that a script can decide.
 */
export interface Check {
    readonly id: string;
    readonly tier: Tier;
    /**
     * What it checks, as a statement that holds when it passes.
     */
    readonly title: string;
    /**
     * How to fix a failure.
     */
    readonly fix: string;
    readonly run: (workspace: Workspace, context: CheckContext) => Promise<CheckOutcome>;
}

/**
 * The published packages of the framework, which the versions check compares with npm.
 */
export const frameworkPackages = [
    '@leyman/check-package',
    '@leyman/configs',
    '@leyman/eslint-config',
    '@leyman/expect',
    '@leyman/framework',
    '@leyman/nx-plugin',
    'mocha-chain',
    'nx-lifecycle',
] as const;

const eslintConfigs = [
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.cjs',
    'eslint.config.ts',
];

const join = (dir: string, file: string): string => Path.posix.join(dir, file);

const hasDependency = (packageJson: PackageJson, name: string): boolean =>
    packageJson.dependencies?.[name] !== undefined ||
    packageJson.devDependencies?.[name] !== undefined;

/**
 * The packages written in TypeScript, which lint, typecheck and check-package apply to: those with a `tsconfig.json`,
 * leaving out a root that only lists the others.
 *
 * @param workspace - the repository
 * @returns each package with a `tsconfig.json`
 */
const typescriptPackages = async (workspace: Workspace): Promise<readonly WorkspacePackage[]> => {
    const found: WorkspacePackage[] = [];
    for (const workspacePackage of workspace.packages) {
        const isListingRoot = workspacePackage.dir === '.' && workspace.packages.length > 1;
        if (
            !isListingRoot &&
            (await workspace.read(join(workspacePackage.dir, 'tsconfig.json'))) !== undefined
        ) {
            found.push(workspacePackage);
        }
    }
    return found;
};

const isPublic = ({ dir, packageJson }: WorkspacePackage, workspace: Workspace): boolean =>
    packageJson.private !== true && (dir !== '.' || workspace.packages.length === 1);

const firstExisting = async (
    workspace: Workspace,
    paths: readonly string[]
): Promise<{ path: string; text: string } | undefined> => {
    for (const path of paths) {
        const text = await workspace.read(path);
        if (text !== undefined) {
            return { path, text };
        }
    }
    return undefined;
};

/**
 * The paths a config's `extends` names, whether one string or a list.
 *
 * @param config - a tsconfig or Biome config
 * @returns each path
 */
const extendsOf = (config: { readonly extends?: unknown } | undefined): readonly string[] => {
    const value = config?.extends;
    if (typeof value === 'string') {
        return [value];
    }
    return Array.isArray(value) ? value.filter(entry => typeof entry === 'string') : [];
};

/**
 * `>=22` style floors only, which check-package requires.
 *
 * @param range - `engines.node`
 * @returns the major, if the range is a floor
 */
const floorOf = (range: string | undefined): number | undefined => {
    const match = /^>=\s*(?<major>\d+)(?:\.\d+){0,2}$/v.exec(range?.trim() ?? '');
    return match === null ? undefined : Number(match.groups!.major);
};

/**
 * Orders versions part by part, as numbers: `0.10.0` is after `0.9.0`. A prerelease counts as after its release, which
 * only ever reads as ahead of npm.
 *
 * @param a - a version
 * @param b - another version
 * @returns negative when `a` is older
 */
const compareVersions = (a: string, b: string): number =>
    a.localeCompare(b, 'en', { numeric: true });

const eslintConfigCheck: Check = {
    id: 'eslint-config',
    tier: 1,
    title: 'Each TypeScript package lints with @leyman/eslint-config',
    fix: "Install @leyman/eslint-config and export its config from each package's eslint.config.js: see https://www.npmjs.com/package/@leyman/eslint-config",
    run: async workspace => {
        const root = await firstExisting(workspace, eslintConfigs);
        const problems: string[] = [];
        const packages = await typescriptPackages(workspace);
        for (const { dir } of packages) {
            const config =
                (await firstExisting(
                    workspace,
                    eslintConfigs.map(file => join(dir, file))
                )) ?? root;
            if (config === undefined) {
                problems.push(`${dir}: no eslint.config.js`);
            } else if (!config.text.includes('@leyman/eslint-config')) {
                problems.push(`${dir}: ${config.path} doesn't use @leyman/eslint-config`);
            }
        }
        return problems;
    },
};

const checkPackageCheck: Check = {
    id: 'check-package',
    tier: 1,
    title: 'Each public TypeScript package runs check-package',
    fix: 'Install @leyman/check-package and run it on each public package: a check-package target (the Nx plugin infers one) or a script. See https://www.npmjs.com/package/@leyman/check-package',
    run: async workspace => {
        const problems: string[] = [];
        const packages = await typescriptPackages(workspace);
        for (const workspacePackage of packages) {
            if (!isPublic(workspacePackage, workspace)) {
                continue;
            }
            const { dir, packageJson } = workspacePackage;
            const project = await workspace.readJson<{ targets?: Record<string, unknown> }>(
                join(dir, 'project.json')
            );
            const isRun =
                project?.targets?.['check-package'] !== undefined ||
                Object.values(packageJson.scripts ?? {}).some(script =>
                    script.includes('check-package')
                );
            if (!isRun) {
                problems.push(`${dir}: nothing runs check-package`);
            }
        }
        return problems;
    },
};

const versionsCheck: Check = {
    id: 'versions',
    tier: 1,
    title: 'The framework packages installed are their latest versions',
    fix: 'Update them, reading each changelog: pnpm update --recursive --latest <package>',
    run: async (workspace, { latestVersion }) => {
        if (latestVersion === false) {
            return { skipped: 'offline' };
        }
        const dirs = new Set(['.', ...workspace.packages.map(({ dir }) => dir)]);
        const installed = new Map<string, Set<string>>();
        for (const dir of dirs) {
            for (const name of frameworkPackages) {
                const manifest = await workspace.readJson<{ version: string }>(
                    join(dir, `node_modules/${name}/package.json`)
                );
                if (manifest === undefined) {
                    continue;
                }
                const versions = installed.get(name) ?? new Set();
                versions.add(manifest.version);
                installed.set(name, versions);
            }
        }
        const problems: string[] = [];
        for (const [name, versions] of installed) {
            let latest: string | undefined;
            try {
                latest = await latestVersion(name);
            } catch (error) {
                return { skipped: `npm's registry: ${(error as Error).message}` };
            }
            if (latest === undefined) {
                continue;
            }
            for (const version of versions) {
                if (compareVersions(version, latest) < 0) {
                    problems.push(`${name}: ${version} installed, ${latest} on npm`);
                }
            }
        }
        return problems;
    },
};

const tsconfigCheck: Check = {
    id: 'tsconfig',
    tier: 2,
    title: "Each package's tsconfig.json extends @leyman/configs, at its support floor when published",
    fix: 'Install @leyman/configs in the package and extend @leyman/configs/tsconfig.node-<floor>.json when it is published (the major of engines.node), else @leyman/configs/tsconfig.build.json',
    run: async workspace => {
        const problems: string[] = [];
        const packages = await typescriptPackages(workspace);
        for (const workspacePackage of packages) {
            const { dir, packageJson } = workspacePackage;
            const node = packageJson.engines?.node;
            const tsconfig = await workspace.readJson<{ extends?: unknown }>(
                join(dir, 'tsconfig.json')
            );
            const shared = extendsOf(tsconfig).filter(path => path.startsWith('@leyman/configs/'));
            const floor = floorOf(node);
            if (shared.length === 0) {
                problems.push(`${dir}: tsconfig.json doesn't extend @leyman/configs`);
            } else if (!hasDependency(packageJson, '@leyman/configs')) {
                problems.push(`${dir}: @leyman/configs isn't installed`);
            } else if (
                floor !== undefined &&
                isPublic(workspacePackage, workspace) &&
                !shared.includes(`@leyman/configs/tsconfig.node-${floor}.json`)
            ) {
                problems.push(
                    `${dir}: engines.node is ${node!}, but tsconfig.json doesn't extend @leyman/configs/tsconfig.node-${floor}.json`
                );
            }
        }
        return problems;
    },
};

const biomeCheck: Check = {
    id: 'biome',
    tier: 2,
    title: 'biome.json extends the shared Biome config',
    fix: 'Write a biome.json at the root with "extends": ["@leyman/configs/biome.base.json"]',
    run: async workspace => {
        const config =
            (await workspace.readJson<{ extends?: unknown }>('biome.json')) ??
            (await workspace.readJson<{ extends?: unknown }>('biome.jsonc'));
        if (config === undefined) {
            return ['No biome.json at the root'];
        }
        return extendsOf(config).some(path => path.endsWith('configs/biome.base.json'))
            ? []
            : ["biome.json doesn't extend @leyman/configs/biome.base.json"];
    },
};

const thresholdKeys = ['branches', 'functions', 'lines', 'statements'] as const;

const lowered = (where: string, config: unknown): readonly string[] => {
    if (typeof config !== 'object' || config === null) {
        return [];
    }
    const record = config as Record<string, unknown>;
    const problems: string[] = [];
    if (record['check-coverage'] === false || record.checkCoverage === false) {
        problems.push(`${where}: turns check-coverage off`);
    }
    for (const key of thresholdKeys) {
        const value = record[key];
        if (typeof value === 'number' && value < 100) {
            problems.push(`${where}: ${key} at ${value}%`);
        }
    }
    return problems;
};

const coverageCheck: Check = {
    id: 'coverage',
    tier: 2,
    title: 'Coverage thresholds stay at 100%',
    fix: "Cover the code instead, or exclude what can't run in a test (`/* c8 ignore next */` with its reason). The shared c8 config requires 100%.",
    run: async workspace => {
        const problems: string[] = [];
        const nxJson = await workspace.readJson<{
            plugins?: readonly (string | { plugin: string; options?: { coverage?: unknown } })[];
        }>('nx.json');
        const plugins = nxJson?.plugins ?? [];
        for (const entry of plugins) {
            if (typeof entry === 'object' && entry.plugin === '@leyman/nx-plugin') {
                problems.push(
                    ...lowered('nx.json @leyman/nx-plugin coverage', entry.options?.coverage)
                );
            }
        }
        for (const { dir, packageJson } of workspace.packages) {
            problems.push(...lowered(join(dir, 'package.json c8'), packageJson.c8));
            for (const file of ['.c8rc', '.c8rc.json']) {
                const path = join(dir, file);
                problems.push(...lowered(path, await workspace.readJson(path)));
            }
        }
        return problems;
    },
};

const pluginsOf = async (workspace: Workspace): Promise<readonly string[]> => {
    const nxJson = await workspace.readJson<{
        plugins?: readonly (string | { plugin: string })[];
    }>('nx.json');
    return (nxJson?.plugins ?? []).map(entry => (typeof entry === 'string' ? entry : entry.plugin));
};

const projectTargets = async (
    workspace: Workspace,
    dir: string
): Promise<Readonly<Record<string, { executor?: string }>> | undefined> => {
    const project = await workspace.readJson<{ targets?: Record<string, { executor?: string }> }>(
        join(dir, 'project.json')
    );
    return project?.targets;
};

const nxPluginCheck: Check = {
    id: 'nx-plugin',
    tier: 3,
    title: "@leyman/nx-plugin infers the packages' targets",
    fix: 'Run `nx add @leyman/nx-plugin`, which adds it to nx.json: see https://jacobley.github.io/leyman/framework/getting-started',
    run: async workspace => {
        const plugins = await pluginsOf(workspace);
        if (plugins.includes('@leyman/nx-plugin')) {
            return [];
        }
        // A workspace that builds the plugin writes its targets out with the executor instead
        for (const { dir } of workspace.packages) {
            const targets = await projectTargets(workspace, dir);
            if (
                Object.values(targets ?? {}).some(
                    ({ executor }) => executor === '@leyman/nx-plugin:targets'
                )
            ) {
                return [];
            }
        }
        return ['nx.json has no @leyman/nx-plugin plugin'];
    },
};

const lifecycleCheck: Check = {
    id: 'lifecycle',
    tier: 3,
    title: 'nx-lifecycle orders the targets',
    fix: 'Add the nx-lifecycle plugin to nx.json with stages and bindings: `nx g @leyman/nx-plugin:init` writes them',
    run: async workspace => {
        const plugins = await pluginsOf(workspace);
        if (plugins.includes('nx-lifecycle/plugin')) {
            return [];
        }
        // Or the executor, with its config file in a project
        const files = await workspace.glob(['lifecycle.json', '*/**/lifecycle.json']);
        return files.length > 0
            ? []
            : ['nx.json has no nx-lifecycle plugin, and no project has a lifecycle.json'];
    },
};

const injectCheck: Check = {
    id: 'inject',
    tier: 3,
    title: 'pnpm injects workspace packages, as published',
    fix: 'Set injectWorkspacePackages: true and dedupeInjectedDeps: false in pnpm-workspace.yaml (`nx g @leyman/nx-plugin:init` sets them)',
    run: async workspace => {
        if (workspace.pnpmWorkspace === undefined) {
            return ['No pnpm-workspace.yaml: the targets assume pnpm'];
        }
        const settings = (workspace.pnpmWorkspace.toJS() ?? {}) as Record<string, unknown>;
        return [
            ...(settings.injectWorkspacePackages === true
                ? []
                : ["injectWorkspacePackages isn't true"]),
            ...(settings.dedupeInjectedDeps === false ? [] : ["dedupeInjectedDeps isn't false"]),
        ];
    },
};

const projectJsonCheck: Check = {
    id: 'project-json',
    tier: 3,
    title: 'Each package declares its targets in project.json, so nx-lifecycle wires them',
    fix: "Declare each target the plugin infers as {} in the package's project.json, as `nx g @leyman/nx-plugin:package` does",
    run: async workspace => {
        const problems: string[] = [];
        for (const { dir } of workspace.packages) {
            const targets = await projectTargets(workspace, dir);
            if (targets === undefined || Object.keys(targets).length === 0) {
                problems.push(`${dir}: no targets in project.json`);
            }
        }
        return problems;
    },
};

const devcontainerCheck: Check = {
    id: 'devcontainer',
    tier: 4,
    title: 'A devcontainer defines the toolchain',
    fix: 'Copy the devcontainer with the fork manifest: see https://jacobley.github.io/leyman/framework/adoption#_4-devcontainer-ci-and-skills',
    run: async workspace => {
        const config = await workspace.read('.devcontainer/devcontainer.json');
        return config === undefined ? ['No .devcontainer/devcontainer.json'] : [];
    },
};

const variable = /\$\{(?<name>\w+)(?::?-(?<fallback>[^\}]*))?\}|\$(?<bare>\w+)/gv;

/**
 * Replaces `${NAME}`, `${NAME:-default}` and `$NAME` with the values known.
 *
 * @param text - an image reference
 * @param values - each variable's value
 * @returns the reference, with what is unknown left in place
 */
const substitute = (text: string, values: ReadonlyMap<string, string>): string =>
    text.replaceAll(variable, (match, ...args: unknown[]) => {
        const { name, fallback, bare } = args.at(-1) as {
            name?: string;
            fallback?: string;
            bare?: string;
        };
        return values.get((name ?? bare)!) ?? fallback ?? match;
    });

const dockerfileImages = (text: string): readonly string[] => {
    const args = new Map<string, string>();
    const stages = new Set<string>(['scratch']);
    const images: string[] = [];
    for (const line of text.split('\n')) {
        const arg = /^\s*arg\s+(?<name>\w+)=(?<value>\S+)/iv.exec(line)?.groups;
        const from = /^\s*from\s+(?:--\S+\s+)*(?<image>\S+)(?:\s+as\s+(?<stage>\S+))?/iv.exec(
            line
        )?.groups;
        if (arg !== undefined) {
            args.set(arg.name!, arg.value!.replaceAll(/^["']|["']$/gv, ''));
        } else if (from !== undefined) {
            const image = substitute(from.image!, args);
            if (!stages.has(image)) {
                images.push(image);
            }
            if (from.stage !== undefined) {
                stages.add(from.stage);
            }
        }
    }
    return images;
};

const imagesPinnedCheck: Check = {
    id: 'images-pinned',
    tier: 4,
    title: "The devcontainer's images are pinned by digest",
    fix: 'Pin each image as name:tag@sha256:<digest>, so a rebuild gets the same image until you choose to update it',
    run: async workspace => {
        const images: [file: string, image: string][] = [];
        const dockerfiles = await workspace.glob(['.devcontainer/**/Dockerfile*']);
        for (const file of dockerfiles) {
            const text = await workspace.read(file);
            images.push(...dockerfileImages(text!).map((image): [string, string] => [file, image]));
        }
        const composeFiles = await workspace.glob(['.devcontainer/**/*compose*.{yml,yaml}']);
        for (const file of composeFiles) {
            const compose = parse((await workspace.read(file))!) as {
                services?: Readonly<Record<string, { image?: unknown } | null>>;
            } | null;
            const services = Object.values(compose?.services ?? {});
            for (const service of services) {
                if (typeof service?.image === 'string') {
                    images.push([file, substitute(service.image, new Map())]);
                }
            }
        }
        return images
            .filter(([, image]) => !image.includes('@sha256:'))
            .map(([file, image]) => `${file}: ${image}`);
    },
};

const ciCheck: Check = {
    id: 'ci',
    tier: 4,
    title: 'CI runs through Dagger, the same as locally',
    fix: 'Copy the Dagger module and workflows with the fork manifest (--with ci,dagger)',
    run: async workspace => {
        const modules = await workspace.glob(['dagger.json', 'dagger/dagger.json']);
        const workflows = await workspace.glob(['.github/workflows/*.{yml,yaml}']);
        return [
            ...(modules.length === 0 ? ['No Dagger module (dagger.json)'] : []),
            ...(workflows.length === 0 ? ['No GitHub Actions workflow'] : []),
        ];
    },
};

/**
 * The entries of each map of workarounds in `pnpm-workspace.yaml`.
 */
const workaroundPaths = [
    ['patchedDependencies'],
    ['overrides'],
    ['packageExtensions'],
    ['peerDependencyRules', 'allowedVersions'],
    ['peerDependencyRules', 'ignoreMissing'],
] as const;

// Pnpm's settings only have plain keys
const keyOf = (pair: Pair): string => String((pair.key as Scalar).value);

const hasComment = (node: unknown): boolean =>
    Boolean((node as { commentBefore?: string | null } | null)?.commentBefore);

/**
 * Whether the section itself has a note, above its key, which covers its first entries.
 *
 * @param document - `pnpm-workspace.yaml`
 * @param path - keys from the document's root to the section
 * @returns whether a comment is above the section's key
 */
const isSectionNoted = (document: Document, path: readonly string[]): boolean => {
    // A map, as the section inside it is one
    const parent = (
        path.length === 1 ? document.contents : document.getIn(path.slice(0, -1), true)
    ) as YAMLMap;
    const pair = parent.items.find(item => keyOf(item) === path.at(-1));
    // A comment above a map's first key belongs to the map
    return (
        hasComment(pair?.key) ||
        hasComment(pair?.value) ||
        (pair === parent.items[0] && hasComment(parent))
    );
};

/**
 * Entries with no note: a comment above the entry, or above an earlier entry with no blank line between them.
 *
 * @param document - `pnpm-workspace.yaml`
 * @returns each entry without a note, as `section: key`
 */
const unnoted = (document: Document): readonly string[] => {
    const problems: string[] = [];
    for (const path of workaroundPaths) {
        const section = document.getIn(path, true);
        if (!isMap(section)) {
            continue;
        }
        let isNoted = isSectionNoted(document, path);
        for (const item of section.items) {
            const key = item.key as { spaceBefore?: boolean } | null;
            isNoted =
                hasComment(item.key) ||
                Boolean((item.value as { comment?: string | null } | null)?.comment) ||
                (isNoted && key?.spaceBefore !== true);
            if (!isNoted) {
                problems.push(`${path.join('.')}: ${keyOf(item)}`);
            }
        }
    }
    return problems;
};

const workaroundsCheck: Check = {
    id: 'workarounds',
    tier: 4,
    title: 'Every workaround says when it ends',
    fix: 'Write a comment above each patch, override and peer rule in pnpm-workspace.yaml naming what removes it (an upstream release, an issue or a date): see https://jacobley.github.io/leyman/framework/principles#every-workaround-says-when-it-ends',
    run: async workspace => {
        const problems: string[] = [];
        for (const field of [
            'overrides',
            'patchedDependencies',
            'packageExtensions',
            'peerDependencyRules',
        ]) {
            if (workspace.packageJson.pnpm?.[field] !== undefined) {
                problems.push(
                    `package.json pnpm.${field}: can't hold a note, move it to pnpm-workspace.yaml`
                );
            }
        }
        if (workspace.pnpmWorkspace !== undefined) {
            problems.push(...unnoted(workspace.pnpmWorkspace));
        }
        return problems;
    },
};

const agentsCheck: Check = {
    id: 'agents',
    tier: 4,
    title: 'Coding agents find AGENTS.md and the skills',
    fix: 'Write an AGENTS.md listing the skills, link CLAUDE.md to it (ln -s AGENTS.md CLAUDE.md), keep the skills in .agents/skills/<name>/SKILL.md, and link .claude/skills to them (ln -s ../.agents/skills .claude/skills)',
    run: async workspace => {
        const agents = await workspace.read('AGENTS.md');
        const claude = await workspace.linkTarget('CLAUDE.md');
        const skills = await workspace.glob(['.agents/skills/*/SKILL.md']);
        const claudeSkills = await workspace.linkTarget('.claude/skills');
        return [
            ...(agents === undefined ? ['No AGENTS.md'] : []),
            ...(claude === 'AGENTS.md' ? [] : ["CLAUDE.md isn't a link to AGENTS.md"]),
            ...(skills.length === 0 ? ['No skills in .agents/skills'] : []),
            ...(claudeSkills === '../.agents/skills'
                ? []
                : [
                      ".claude/skills isn't a link to ../.agents/skills, the only skills Claude Code reads",
                  ]),
        ];
    },
};

/**
 * Every check, by tier.
 */
export const checks: readonly Check[] = [
    eslintConfigCheck,
    checkPackageCheck,
    versionsCheck,
    tsconfigCheck,
    biomeCheck,
    coverageCheck,
    nxPluginCheck,
    lifecycleCheck,
    injectCheck,
    projectJsonCheck,
    devcontainerCheck,
    imagesPinnedCheck,
    ciCheck,
    workaroundsCheck,
    agentsCheck,
];
