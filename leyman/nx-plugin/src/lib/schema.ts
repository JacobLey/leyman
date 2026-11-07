import type { NxPluginOptions } from './options.js';
import {
    arraySchema,
    booleanSchema,
    enumSchema,
    mergeSchema,
    numberSchema,
    objectSchema,
    stringSchema,
} from 'juniper';
import { makeValidator } from 'juniper-validator';
import { namedInputNames, targetNames } from './options.js';

const inputsSchema = arraySchema(
    mergeSchema().oneOf([
        stringSchema({ description: 'A file pattern, or the name of a named input' }),
        objectSchema({
            description: 'An input object, such as `{ "externalDependencies": ["pkg"] }`',
        }),
    ])
);

const rootsSchema = arraySchema(
    stringSchema({ description: 'Root of a project, e.g. `packages/a`' })
);

const targetSchema = mergeSchema().oneOf([
    enumSchema({ enum: [false] as const, description: 'Infer the target nowhere' }),
    objectSchema({
        properties: {
            name: stringSchema({ description: "Name of the target. Defaults to the target's own" }),
            include: rootsSchema.description('Projects that get the target whatever their files'),
            exclude: rootsSchema.description('Projects that never get the target'),
        },
        additionalProperties: false,
    }),
]);

const maxPercent = 100;
const percentSchema = numberSchema({ minimum: 0, maximum: maxPercent });

const optionsProperties = {
    targets: objectSchema({
        description: "Each target's options, or `false` to infer it nowhere",
        properties: Object.fromEntries(targetNames.map(name => [name, targetSchema])),
        additionalProperties: false,
    }),
    configs: objectSchema({
        description: 'Paths of the shared configs, relative to each project',
        properties: {
            swc: stringSchema({ default: 'node_modules/@leyman/configs/swcrc.jsonc' }),
            c8: stringSchema({ default: 'node_modules/@leyman/configs/c8rc.json' }),
            vitest: stringSchema({ default: 'node_modules/@leyman/configs/vitest.config.js' }),
        },
        additionalProperties: false,
    }),
    scripts: stringSchema({
        description:
            "Directory to run the plugin's scripts from, instead of the package's bins (`leyman-swc-compile`...)",
    }),
    coverage: objectSchema({
        description: "Coverage thresholds `coverage-report` passes to c8, over the c8 config's",
        properties: {
            branches: percentSchema,
            functions: percentSchema,
            lines: percentSchema,
            statements: percentSchema,
        },
        additionalProperties: false,
    }),
    checkPackage: objectSchema({
        description: 'Options of `check-package`',
        properties: {
            profile: enumSchema({
                enum: ['esm-only', 'node16', 'strict'] as const,
                description: 'The module resolutions every entry point must work under',
            }),
            floorTsconfig: mergeSchema().oneOf([
                stringSchema({
                    description:
                        "The config a package's `tsconfig.json` must extend, with `{major}` for its support floor",
                    default: '@leyman/configs/tsconfig.node-{major}.json',
                }),
                enumSchema({ enum: [false] as const, description: 'Not checked' }),
            ]),
            inputs: inputsSchema.description('What a change of check-package itself is hashed by'),
        },
        additionalProperties: false,
    }),
    inputs: objectSchema({
        description: 'What changes of the shared tools are hashed by',
        properties: {
            configs: inputsSchema.description(
                'The shared configs, for every target that reads one'
            ),
            tools: inputsSchema.description(
                "This plugin's scripts, for every target that runs one"
            ),
        },
        additionalProperties: false,
    }),
    namedInputs: objectSchema({
        description: 'Inputs added to the end of each named input, such as a file the tests read',
        properties: Object.fromEntries(namedInputNames.map(name => [name, inputsSchema])),
        additionalProperties: false,
    }),
};

const optionsSchema = objectSchema({
    title: '@leyman/nx-plugin',
    description: 'Infers the targets of TypeScript ESM packages',
    properties: optionsProperties,
    additionalProperties: false,
});

/**
 * JSON schema of the options, for `nx.json` or the file the `targets` executor reads.
 */
export const optionsJsonSchema = optionsSchema
    .properties({
        $schema: stringSchema({ description: 'Path or URL of this JSON schema' }),
    })
    .toJSON({ schema: true });

const executorSchema = objectSchema({
    title: 'targets',
    description:
        "Writes the plugin's named inputs and target defaults into nx.json, and the targets each project gets into its project.json",
    properties: {
        config: stringSchema({
            description:
                'Path of the file holding the plugin options, relative to the workspace root',
        }),
        check: booleanSchema({
            description:
                'Fail rather than write when a file is out of date. Defaults to true in CI',
        }),
    },
    required: ['config'],
    additionalProperties: false,
});

/**
 * JSON schema of the `targets` executor's options.
 */
export const executorJsonSchema = executorSchema
    .metadata({ version: 1, outputCapture: 'direct-nodejs', cli: 'nx' })
    .toJSON();

/**
 * Major of the oldest Node.js a package the `package` generator adds supports, unless told otherwise.
 */
export const defaultFloor = 22;

const packageGeneratorSchema = objectSchema({
    title: 'package',
    description:
        'Adds a TypeScript ESM package, with a project.json declaring the targets the plugin infers',
    properties: {
        directory: stringSchema({
            description: 'Where the package goes, relative to the workspace root',
        }).metadata({
            $default: { $source: 'argv', index: 0 },
            'x-prompt': 'Which directory should the package go in?',
        }),
        name: stringSchema({
            description: "Name of the package. Defaults to the directory's last segment",
        }),
        description: stringSchema({
            description: 'Description, for package.json and the README',
        }).metadata('x-prompt', 'What does the package do?'),
        published: booleanSchema({
            description: 'Published to npm, rather than private',
            default: false,
        }),
        floor: numberSchema({
            type: 'integer',
            description: 'Major of the oldest Node.js a published package supports',
            default: defaultFloor,
        }),
        test: enumSchema({
            enum: ['mocha', 'vitest', 'none'] as const,
            description: 'Test runner, or none',
            default: 'mocha',
        }),
        repository: stringSchema({
            description:
                "URL of the workspace's GitHub repository, for a published package's repository, homepage and bugs",
        }),
        author: stringSchema({ description: 'author of package.json' }),
        license: stringSchema({
            description:
                "license of package.json. A published package also gets a copy of the workspace's LICENSE",
        }),
        devDependencies: arraySchema(stringSchema()).description(
            'More packages to add to devDependencies'
        ),
        config: stringSchema({
            description:
                'File of the plugin options, relative to the workspace root, for a workspace running the targets executor. Defaults to the options in nx.json',
        }),
        skipInstall: booleanSchema({
            description: "Don't install dependencies afterwards",
            default: false,
        }),
    },
    required: ['directory', 'description'],
    additionalProperties: false,
});

/**
 * JSON schema of the `package` generator's options.
 */
export const packageGeneratorJsonSchema = packageGeneratorSchema
    .metadata('cli', 'nx')
    .toJSON({ schema: true });

const initGeneratorSchema = objectSchema({
    title: 'init',
    description:
        'Sets an Nx workspace up for the plugin: nx.json, root devDependencies, the Biome config, pnpm injection and the principles skill',
    properties: {
        lifecycle: booleanSchema({
            description: "Wire the targets' order with nx-lifecycle",
            default: true,
        }),
        skill: booleanSchema({
            description:
                "Have pnpm link the skills of the framework's packages into .agents/skills, and link .claude/skills to it",
            default: true,
        }),
        skipInstall: booleanSchema({
            description: "Don't install dependencies afterwards",
            default: false,
        }),
    },
    additionalProperties: false,
});

/**
 * JSON schema of the `init` generator's options.
 */
export const initGeneratorJsonSchema = initGeneratorSchema
    .metadata('cli', 'nx')
    .toJSON({ schema: true });

const optionsValidator = makeValidator(optionsJsonSchema);

/**
 * Asserts the plugin options are valid, with each problem in the error's message.
 *
 * @param options - the options, from `nx.json` or a file
 * @param where - where they are from, for the message
 * @throws {Error} naming each invalid option
 */
export const assertOptions: (
    options: unknown,
    where: string
) => asserts options is NxPluginOptions = (options, where) => {
    const { issues } = optionsValidator.validate(options);
    if (issues === undefined) {
        return;
    }
    throw new Error(
        [
            `Invalid @leyman/nx-plugin options in ${where}:`,
            ...issues.map(({ message, path = [] }) => {
                // Juniper-validator gives each segment as the key itself, never as an object
                const at = path.map(key => `/${String(key as PropertyKey)}`).join('');
                return `- options${at} ${message}`;
            }),
        ].join('\n')
    );
};
