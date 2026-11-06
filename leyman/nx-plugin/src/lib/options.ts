import type { TargetConfiguration } from '@nx/devkit';

/**
 * The targets the plugin infers, in the order a `project.json` lists them.
 */
export const targetNames = [
    'biome',
    'eslint',
    'check-package',
    'update-ts-references',
    'tsc',
    'tsc-test',
    'mocha-unit-test',
    'mocha-integration-test',
    'vitest-unit-test',
    'coverage-report',
    'sync-injected',
] as const;
export type TargetName = (typeof targetNames)[number];

/**
 * The named inputs the plugin's targets use, and defines.
 */
export const namedInputNames = [
    'dependency-files',
    'package-files',
    'eslint-input',
    'ts-source',
    'dependency-builds',
    'test-source',
] as const;
export type NamedInputName = (typeof namedInputNames)[number];

/**
 * An entry of a target's `inputs` or of a named input.
 */
export type Input = NonNullable<TargetConfiguration['inputs']>[number];

/**
 * How one target is inferred.
 */
export interface TargetOptions {
    /**
     * Name of the target in the project graph.
     *
     * @default the target's own name, e.g. `tsc`
     */
    readonly name?: string;
    /**
     * Roots of projects (`packages/a`) that get the target whatever their files.
     */
    readonly include?: readonly string[];
    /**
     * Roots of projects that never get the target.
     */
    readonly exclude?: readonly string[];
}

/**
 * Options of the plugin, in `nx.json` (plugin mode) or in the file the `targets` executor reads.
 */
export interface NxPluginOptions {
    /**
     * Each target's options, or `false` to infer it nowhere.
     */
    readonly targets?: Readonly<Partial<Record<TargetName, false | TargetOptions>>>;
    /**
     * Paths of the shared configs, relative to each project.
     */
    readonly configs?: {
        /**
         * @default 'node_modules/@leyman/configs/swcrc.jsonc'
         */
        readonly swc?: string;
        /**
         * @default 'node_modules/@leyman/configs/c8rc.json'
         */
        readonly c8?: string;
        /**
         * @default 'node_modules/@leyman/configs/vitest.config.js'
         */
        readonly vitest?: string;
    };
    /**
     * Directory to run the plugin's scripts from, such as `$NX_WORKSPACE_ROOT/tools/nx-plugin/scripts` for a copy kept
     * in the workspace. By default, they run as the package's bins (`leyman-swc-compile`...).
     */
    readonly scripts?: string;
    /**
     * Coverage thresholds `coverage-report` passes to c8, over the c8 config's.
     */
    readonly coverage?: {
        readonly branches?: number;
        readonly functions?: number;
        readonly lines?: number;
        readonly statements?: number;
    };
    /**
     * Options of `check-package`.
     */
    readonly checkPackage?: {
        /**
         * The module resolutions every entry point must work under.
         *
         * @default check-package's own, `strict`
         */
        readonly profile?: 'esm-only' | 'node16' | 'strict';
        /**
         * The config a package's `tsconfig.json` must extend, with `{major}` for its support floor, or `false`
         * not to check it.
         *
         * @default '@leyman/configs/tsconfig.node-{major}.json'
         */
        readonly floorTsconfig?: false | string;
        /**
         * What a change of check-package itself is hashed by.
         *
         * @default [{ externalDependencies: ['@leyman/check-package', 'typescript'] }]
         */
        readonly inputs?: readonly Input[];
    };
    /**
     * What changes of the shared tools are hashed by.
     */
    readonly inputs?: {
        /**
         * The shared configs, for every target that reads one.
         *
         * @default [{ externalDependencies: ['@leyman/configs'] }]
         */
        readonly configs?: readonly Input[];
        /**
         * This plugin's scripts, for every target that runs one.
         *
         * @default [{ externalDependencies: ['@leyman/nx-plugin'] }]
         */
        readonly tools?: readonly Input[];
    };
    /**
     * Inputs added to the end of each named input, such as a file the tests read.
     */
    readonly namedInputs?: Readonly<Partial<Record<NamedInputName, readonly Input[]>>>;
}

/**
 * The options with every default filled in.
 */
export interface ResolvedOptions {
    readonly targets: Readonly<
        Record<
            TargetName,
            false | { name: string; include: readonly string[]; exclude: readonly string[] }
        >
    >;
    readonly configs: { readonly swc: string; readonly c8: string; readonly vitest: string };
    readonly scripts: string | undefined;
    readonly coverage: NonNullable<NxPluginOptions['coverage']>;
    readonly checkPackage: {
        readonly profile: 'esm-only' | 'node16' | 'strict' | undefined;
        readonly floorTsconfig: false | string;
        readonly inputs: readonly Input[];
    };
    readonly inputs: { readonly configs: readonly Input[]; readonly tools: readonly Input[] };
    readonly namedInputs: Readonly<Record<NamedInputName, readonly Input[]>>;
}

/**
 * Fills in the default of every option.
 *
 * @param options - the plugin's options
 * @returns every option
 */
export const resolveOptions = (options: NxPluginOptions = {}): ResolvedOptions => ({
    targets: Object.fromEntries(
        targetNames.map(target => {
            const targetOptions = options.targets?.[target] ?? {};
            return [
                target,
                targetOptions === false
                    ? false
                    : {
                          name: targetOptions.name ?? target,
                          include: targetOptions.include ?? [],
                          exclude: targetOptions.exclude ?? [],
                      },
            ];
        })
    ) as ResolvedOptions['targets'],
    configs: {
        swc: options.configs?.swc ?? 'node_modules/@leyman/configs/swcrc.jsonc',
        c8: options.configs?.c8 ?? 'node_modules/@leyman/configs/c8rc.json',
        vitest: options.configs?.vitest ?? 'node_modules/@leyman/configs/vitest.config.js',
    },
    scripts: options.scripts,
    coverage: options.coverage ?? {},
    checkPackage: {
        profile: options.checkPackage?.profile,
        floorTsconfig:
            options.checkPackage?.floorTsconfig ?? '@leyman/configs/tsconfig.node-{major}.json',
        inputs: options.checkPackage?.inputs ?? [
            { externalDependencies: ['@leyman/check-package', 'typescript'] },
        ],
    },
    inputs: {
        configs: options.inputs?.configs ?? [{ externalDependencies: ['@leyman/configs'] }],
        tools: options.inputs?.tools ?? [{ externalDependencies: ['@leyman/nx-plugin'] }],
    },
    namedInputs: Object.fromEntries(
        namedInputNames.map(name => [name, options.namedInputs?.[name] ?? []])
    ) as Record<NamedInputName, readonly Input[]>,
});
