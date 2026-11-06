import type { TargetConfiguration } from '@nx/devkit';
import type { Input, NamedInputName, ResolvedOptions, TargetName } from './options.js';

const nodeVersion: Input = { runtime: 'node --version' };

const declarationExtensions = ['d.ts', 'd.mts', 'd.cts'];
const builtExtensions = ['js', 'mjs', 'cjs', ...declarationExtensions, 'wasm'];

/**
 * Quotes an argument for the shell, unless it is plain.
 *
 * @param argument - argument of a command
 * @returns the argument, safe to put in a command
 */
const quote = (argument: string): string => {
    if (/^[\w%+,\-.\/:=@\{\}]+$/v.test(argument)) {
        return argument;
    }
    const escaped = argument.replaceAll("'", String.raw`'\''`);
    return `'${escaped}'`;
};

// Nx's tokens, replaced in commands, inputs and outputs per project
const projectName = '{projectName}';
const workspaceRoot = '{workspaceRoot}';

// The shell expands it, so a workspace can run another `tsc`
// eslint-disable-next-line no-template-curly-in-string -- Not a template: the shell's syntax
const tsc = '${TSC:-tsc}';

/**
 * The named inputs the targets use.
 *
 * @param options - resolved options
 * @returns each named input
 */
export const namedInputs = (options: ResolvedOptions): Record<NamedInputName, Input[]> => {
    const own: Record<NamedInputName, Input[]> = {
        'dependency-files': [
            '{projectRoot}/executors.json',
            '{projectRoot}/*.(c|m)?js',
            '{projectRoot}/*.d.(c|m)?ts',
            '{projectRoot}/data/**/*',
            '{projectRoot}/out/**/*',
        ],
        'package-files': ['{projectRoot}/package.json', 'dependency-files'],
        'eslint-input': ['{projectRoot}/eslint.config.js'],
        'ts-source': [
            nodeVersion,
            ...options.inputs.configs,
            ...options.inputs.tools,
            '{projectRoot}/package.json',
            '{projectRoot}/tsconfig.json',
            '{projectRoot}/src/**/*',
            // Otherwise Nx hashes every external dependency into every task
            { externalDependencies: [] },
        ],
        'dependency-builds': [
            // Written by `sync-injected`: the fields of a dependency's package.json that can affect a dependent
            { dependentTasksOutputFiles: '**/package-surface.json', transitive: true },
            ...builtExtensions.map(extension => ({
                dependentTasksOutputFiles: `**/dist/**/*.${extension}`,
                transitive: true,
            })),
        ],
        'test-source': [
            'ts-source',
            '{projectRoot}/test/**/*',
            'package-files',
            'dependency-builds',
        ],
    };
    return Object.fromEntries(
        Object.entries(own).map(([name, inputs]) => [
            name,
            [...inputs, ...options.namedInputs[name as NamedInputName]],
        ])
    ) as Record<NamedInputName, Input[]>;
};

const runCommands = (
    commands: string[],
    options: Record<string, unknown> = {}
): Pick<TargetConfiguration, 'executor' | 'options'> => ({
    executor: 'nx:run-commands',
    options: { commands, ...options, color: true, cwd: '{projectRoot}' },
});

const scriptFiles = {
    'biome-format': 'biome-format.sh',
    'clean-dist': 'clean-dist.sh',
    'coverage-report': 'coverage-report.sh',
    'swc-compile': 'swc-compile.sh',
    'sync-injected': 'sync-injected.mjs',
} as const;

const coverageDirectory = `$NX_WORKSPACE_ROOT/.coverage/project/${projectName}/tmp`;

/**
 * A test target, run under c8 so `coverage-report` can check the coverage of all of them together.
 *
 * @param kind - `unit` or `integration`, the directory of the tests and of their coverage
 * @param command - the runner's command
 * @returns the target, cached by the tests and builds it runs
 */
const testTarget = (kind: string, command: string): TargetConfiguration => ({
    ...runCommands(
        [
            `rm -rf ${coverageDirectory}/${kind} && NODE_OPTIONS=--enable-source-maps c8 --temp-directory=${coverageDirectory}/${kind} --src=$NX_WORKSPACE_ROOT --clean=false --reporter=none ${command}`,
        ],
        { parallel: true }
    ),
    cache: true,
    inputs: ['test-source', '^dependency-files'],
    outputs: [`${workspaceRoot}/.coverage/project/${projectName}/tmp/${kind}`],
});

/**
 * How each target runs, without when: the lifecycle's `dependsOn` is nx-lifecycle's to add.
 *
 * @param options - resolved options
 * @returns each target's configuration, by the target's own name
 */
export const targetConfigurations = (
    options: ResolvedOptions
): Record<TargetName, TargetConfiguration> => {
    const { checkPackage, configs, coverage, scripts } = options;
    const script = (name: keyof typeof scriptFiles): string =>
        scripts === undefined ? `leyman-${name}` : `${scripts}/${scriptFiles[name]}`;
    const thresholds = (['branches', 'functions', 'lines', 'statements'] as const)
        .map(metric => {
            const threshold = coverage[metric];
            return threshold === undefined ? '' : ` --${metric} ${threshold}`;
        })
        .join('');
    const checkPackageFlags = [
        ...(checkPackage.profile === undefined ? [] : [` --profile ${checkPackage.profile}`]),
        ...(checkPackage.floorTsconfig === false
            ? []
            : [` --floor-tsconfig ${quote(checkPackage.floorTsconfig)}`]),
    ].join('');

    return {
        biome: {
            ...runCommands([script('biome-format')]),
            configurations: { check: { commands: ['biome format .'] } },
            cache: false,
        },
        eslint: {
            executor: 'nx:run-commands',
            options: {
                commands: ['{projectRoot}/node_modules/.bin/eslint {projectRoot} --color'],
                color: true,
            },
            configurations: { fix: { fix: true } },
            cache: true,
            inputs: [
                'eslint-input',
                'ts-source',
                '{projectRoot}/test/**/*',
                'package-files',
                'dependency-builds',
                '^dependency-files',
            ],
            outputs: [],
        },
        'check-package': {
            ...runCommands([`check-package${checkPackageFlags}`]),
            cache: true,
            inputs: [
                nodeVersion,
                '{projectRoot}/**/*',
                '!{projectRoot}/CHANGELOG.md',
                '!{projectRoot}/eslint.config.js',
                '!{projectRoot}/test/**/*',
                '{workspaceRoot}/.gitignore',
                'dependency-builds',
                ...checkPackage.inputs,
            ],
            outputs: [],
        },
        'update-ts-references': {
            executor: 'nx:noop',
            syncGenerators: ['@nx/js:typescript-sync'],
            cache: true,
            inputs: ['{projectRoot}/package.json', '{projectRoot}/tsconfig.json'],
            outputs: ['{projectRoot}/tsconfig.json'],
        },
        tsc: {
            ...runCommands(
                [
                    script('clean-dist'),
                    `${script('swc-compile')} ./src ./dist ${quote(configs.swc)}`,
                    tsc,
                ],
                { parallel: false }
            ),
            cache: true,
            inputs: ['ts-source', 'dependency-builds', '^dependency-files'],
            outputs: ['{projectRoot}/dist'],
        },
        'tsc-test': {
            ...runCommands(
                [
                    'rm -rf ./dist-test',
                    `${script('swc-compile')} ./test ./dist-test ${quote(configs.swc)}`,
                    `${tsc} -p ./test`,
                ],
                { parallel: false }
            ),
            cache: true,
            inputs: ['test-source', '^dependency-files'],
            outputs: ['{projectRoot}/dist-test'],
        },
        'mocha-unit-test': testTarget(
            'unit',
            'mocha --recursive "$PWD/dist-test/unit/**/*.spec.*js"'
        ),
        'mocha-integration-test': testTarget(
            'integration',
            'mocha --timeout 10000 --recursive "$PWD/dist-test/integration/**/*.spec.*js"'
        ),
        'vitest-unit-test': testTarget(
            'unit',
            `vitest run --config ${quote(configs.vitest)} --root .`
        ),
        'coverage-report': {
            ...runCommands([`${script('coverage-report')} ${quote(configs.c8)}${thresholds}`]),
            cache: true,
            inputs: [
                nodeVersion,
                'ts-source',
                { dependentTasksOutputFiles: '.coverage/project/**/*.json', transitive: true },
            ],
            outputs: ['{workspaceRoot}/.coverage/project/{projectName}/report'],
        },
        'sync-injected': {
            ...runCommands([script('sync-injected')]),
            // Dependents hash the copies it writes, so it must never be skipped
            cache: false,
            outputs: ['{workspaceRoot}/.package-surface/{projectName}/package-surface.json'],
        },
    };
};
