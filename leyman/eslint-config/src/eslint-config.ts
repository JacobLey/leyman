/* eslint-disable @typescript-eslint/no-magic-numbers -- Rule options, such as limits, are numbers */

import type { RuleModule } from '@typescript-eslint/utils/ts-eslint';
import type { ESLint, Linter, Rule } from 'eslint';
import Path from 'node:path';
import { fileURLToPath } from 'node:url';
import typescriptPlugin from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import { getInternalRegex } from './lib/internal-regex.js';
import { assertIsPackageJson } from './lib/package-json-schema.js';
import { packagePluginConfig } from './lib/package-plugins.js';
import {
    commentsPlugin,
    eslintConfig,
    importPlugin,
    jsDocPlugin,
    jsxA11yPlugin,
    nodePlugin,
    prettierConfig,
    reactHooksPlugin,
    reactPlugin,
    regexpPlugin,
    sonarPlugin,
    unicornPlugin,
} from './lib/plugins.js';

// Rules without `meta.languages` support every language
const isForJavaScript = (rule: {
    meta?: { languages?: readonly string[] | undefined } | undefined;
}): boolean => {
    const languages = rule.meta?.languages;
    return !languages || languages.includes('*') || languages.includes('js/js');
};

interface PluginRules {
    rules?: Record<string, Rule.RuleModule | RuleModule<string, unknown[]>> | undefined;
}
export const nonDeprecatedRules = (name: string, plugin: PluginRules): Linter.RulesRecord => {
    const rules: Linter.RulesRecord = {};
    for (const [ruleName, rule] of Object.entries(plugin.rules!)) {
        if (
            typeof rule === 'object' &&
            (rule.meta?.deprecated ?? false) === false &&
            isForJavaScript(rule)
        ) {
            rules[`${name}/${ruleName}`] = 'error';
        }
    }
    return rules;
};

const disableReplacedTypeRules = (): Linter.RulesRecord => {
    const rules: Linter.RulesRecord = {};
    for (const [ruleName, rule] of Object.entries(typescriptPlugin.rules)) {
        const { extendsBaseRule } = rule.meta.docs;
        if (typeof extendsBaseRule === 'string') {
            rules[extendsBaseRule] = 'off';
        } else if (extendsBaseRule) {
            rules[ruleName] = 'off';
        }
    }
    return rules;
};

// https://typescript-eslint.io/rules/naming-convention/
export const baseNamingConvention = [
    {
        selector: 'default',
        format: ['camelCase'],
        leadingUnderscore: 'forbid',
        trailingUnderscore: 'forbid',
    },
    {
        selector: 'enum',
        format: ['PascalCase'],
    },
    {
        selector: 'enumMember',
        format: ['UPPER_CASE'],
    },
    {
        selector: 'property',
        modifiers: ['public'],
        format: null,
    },
    {
        selector: 'typeProperty',
        modifiers: ['public'],
        format: ['camelCase', 'snake_case'],
    },
    {
        selector: 'typeProperty',
        modifiers: ['public'],
        format: ['PascalCase'],
    },
    {
        selector: 'property',
        modifiers: ['static', 'readonly'],
        format: ['camelCase'],
    },
    {
        selector: 'memberLike',
        modifiers: ['private'],
        format: ['camelCase'],
        leadingUnderscore: 'require',
    },
    {
        selector: 'class',
        format: ['PascalCase'],
    },
    {
        selector: 'interface',
        format: ['PascalCase'],
    },
    {
        selector: 'typeAlias',
        format: ['PascalCase'],
    },
    {
        selector: 'typeParameter',
        format: ['PascalCase'],
    },
    {
        selector: 'parameter',
        modifiers: ['unused'],
        format: ['camelCase'],
        leadingUnderscore: 'require',
    },
    {
        selector: 'import',
        modifiers: ['default'],
        format: ['camelCase', 'PascalCase'],
    },
    {
        selector: 'import',
        modifiers: ['namespace'],
        format: ['camelCase', 'PascalCase'],
    },
    {
        selector: 'variable',
        modifiers: ['const', 'global'],
        format: ['camelCase', 'UPPER_CASE'],
    },
];

// React components are PascalCase, so JSX files also allow it for anything that may be a component.
// Function-typed variables are listed with and without `global`, so they are more specific than either base rule.
export const reactComponentNamingConvention = [
    {
        selector: 'function',
        format: ['camelCase', 'PascalCase'],
    },
    {
        selector: 'variable',
        modifiers: ['const'],
        types: ['function'],
        format: ['camelCase', 'PascalCase'],
    },
    {
        selector: 'variable',
        modifiers: ['const', 'global'],
        types: ['function'],
        format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
    },
];

/**
 * Generate flat ESLint config for the specified project.
 * Patterns are relative to the project, so run ESLint from the project directory,
 * or from a parent directory, where ESLint looks up the config from each file.
 *
 * @param params - parameters
 * @param params.configUrl - `import.meta.url` of project-level `eslint.config.js` file.
 * @param params.packageJson - Loaded `package.json` file
 * @param params.plugins - ESLint plugins shipped by packages (e.g. `generated-signature/eslint`), turned on with their recommended rules
 * @returns Generated flat config for most rules and plugins. Can be extended as necessary via normal Flat Config extension.
 */
export default function makeEslintConfigForPackage({
    configUrl,
    packageJson,
    plugins = [],
}: {
    /**
     * `import.meta.url` of project-level `eslint.config.js` file.
     */
    configUrl: string;
    /**
     * Loaded `package.json` file
     */
    packageJson: unknown;
    /**
     * ESLint plugins shipped by packages, e.g. `generated-signature/eslint`.
     * Each needs `meta.namespace` and a flat `configs.recommended`, whose rules are turned on
     * outside `test/`.
     * The project must depend on the package providing the plugin.
     */
    plugins?: readonly ESLint.Plugin[];
}): Linter.Config[] {
    assertIsPackageJson(packageJson);

    const projectUrl = Path.dirname(fileURLToPath(configUrl));
    const sourceFiles = ['**/*.{c,m,}ts{x,}', '**/*.{c,m,}js'] as const;
    const extraneousDependencies = { includeInternal: true, whitelist: [packageJson.name] };

    return [
        {
            // `src/generated` holds code generated into source, e.g. by the `genever` target
            ignores: [
                'coverage',
                'dist',
                'dist-test',
                'node_modules',
                'out',
                'src/generated',
                '.eslintcache',
            ].map(directory => `${directory}/**`),
        },
        {
            files: [...sourceFiles],
            languageOptions: {
                ecmaVersion: 'latest',
                parser: typescriptParser,
                parserOptions: {
                    ecmaVersion: 'latest',
                    projectService: {
                        allowDefaultProject: ['*.{c,m,}js'],
                    },
                    tsconfigRootDir: projectUrl,
                },
                globals: {
                    console: 'readonly',
                    setImmediate: 'readonly',
                    setTimeout: 'readonly',
                },
            },
            linterOptions: {
                reportUnusedDisableDirectives: true,
            },
            plugins: {
                '@eslint-community/eslint-comments': commentsPlugin,
                '@typescript-eslint': typescriptPlugin as unknown as ESLint.Plugin,
                'import-x': importPlugin,
                jsdoc: jsDocPlugin,
                'jsx-a11y': jsxA11yPlugin,
                n: nodePlugin,
                react: reactPlugin,
                'react-hooks': reactHooksPlugin,
                regexp: regexpPlugin,
                sonarjs: sonarPlugin,
                unicorn: unicornPlugin,
            },
            settings: {
                'import-x/internal-regex': getInternalRegex(packageJson),
                react: {
                    // Keep in sync with `react` in the workspace catalog
                    version: '19.3.0',
                },
            },
            rules: {
                ...eslintConfig.configs.all.rules,
                'arrow-body-style': ['error', 'as-needed'],
                // Names from outside JavaScript keep their own case (e.g. Postgres's `lc_time`); `@typescript-eslint/naming-convention` checks the repo's
                camelcase: 'off',
                'capitalized-comments': [
                    'error',
                    'always',
                    {
                        ignoreConsecutiveComments: true,
                        ignoreInlineComments: true,
                        ignorePattern: String.raw`\w+:|^ biome-ignore (?:format|lint):`,
                    },
                ],
                // Replaced by `@typescript-eslint/class-methods-use-this`
                'class-methods-use-this': 'off',
                // Complexity and size are left to review, not capped
                complexity: 'off',
                'consistent-this': ['error', 'self'],
                'func-names': ['error', 'never'],
                'func-style': ['error', 'expression', { allowArrowFunctions: true }],
                // Deprecated, and needs a list of names
                'id-blacklist': 'off',
                // Short names are fine in short scopes, e.g. `a` and `b` in a sort
                'id-length': 'off',
                // Needs a pattern, and `@typescript-eslint/naming-convention` checks names
                'id-match': 'off',
                // A short comment may end a line
                'line-comment-position': 'off',
                // A package's error classes live together in one file
                'max-classes-per-file': 'off',
                // Complexity and size are left to review, not capped
                'max-depth': 'off',
                // Complexity and size are left to review, not capped
                'max-lines': 'off',
                // Complexity and size are left to review, not capped
                'max-lines-per-function': 'off',
                // Complexity and size are left to review, not capped
                'max-statements': 'off',
                'multiline-comment-style': ['error', 'separate-lines'],
                'new-cap': ['error', { capIsNew: false }],
                // Some work runs one at a time on purpose, e.g. against one database
                'no-await-in-loop': 'off',
                'no-constant-condition': ['error', { checkLoops: false }],
                // `continue` keeps a loop flat, like an early return
                'no-continue': 'off',
                'no-empty': ['error', { allowEmptyCatch: true }],
                'no-duplicate-imports': ['error', { allowSeparateTypeImports: true }],
                'no-implicit-coercion': ['error', { allow: ['!!'] }],
                // A short comment may end a line
                'no-inline-comments': 'off',
                // Biome adds semicolons, so `++` has none of the pitfalls this guards against
                'no-plusplus': 'off',
                // Needs a list of what to restrict
                'no-restricted-imports': 'off',
                // Needs a list of what to restrict
                'no-restricted-modules': 'off',
                // Needs a list of what to restrict
                'no-restricted-properties': 'off',
                'no-restricted-syntax': [
                    'error',
                    {
                        // Published declarations keep `const`, which consumers compiling with
                        // `isolatedModules` (swc, esbuild...) cannot read. Emitted JS is identical.
                        selector: 'ExportNamedDeclaration > TSEnumDeclaration[const=true]',
                        message:
                            "Don't export const enums; consumers using isolatedModules can't read them. Use a regular enum",
                    },
                    {
                        selector: 'LabeledStatement',
                        message:
                            'Labels are a form of GOTO; using them makes code ' +
                            'confusing and hard to maintain and understand.',
                    },
                ],
                // Ternaries are allowed; `unicorn/prefer-ternary` keeps them to one line
                'no-ternary': 'off',
                // `undefined` is how the repo writes a missing value
                'no-undefined': 'off',
                'no-void': ['error', { allowAsStatement: true }],
                // A TODO comment may record a known follow-up
                'no-warning-comments': 'off',
                'one-var': ['error', 'never'],
                'prefer-const': [
                    'error',
                    {
                        destructuring: 'all',
                        ignoreReadBeforeAssign: true,
                    },
                ],
                // Replaced by `@typescript-eslint/prefer-destructuring`
                'prefer-destructuring': 'off',
                'sort-imports': [
                    'error',
                    {
                        ignoreCase: true,
                        ignoreDeclarationSort: true,
                    },
                ],
                // Keys are ordered by meaning, not alphabetically
                'sort-keys': 'off',
                'spaced-comment': [
                    'error',
                    'always',
                    {
                        exceptions: ['*'],
                        markers: ['!'],
                    },
                ],
                // `var` only appears in `declare global`, where its position doesn't matter
                'vars-on-top': 'off',

                // TypeScript
                ...disableReplacedTypeRules(),
                ...nonDeprecatedRules('@typescript-eslint', typescriptPlugin),
                '@typescript-eslint/ban-ts-comment': [
                    'error',
                    {
                        'ts-expect-error': false,
                        'ts-ignore': true,
                        'ts-nocheck': true,
                        'ts-check': true,
                    },
                ],
                '@typescript-eslint/consistent-type-assertions': 'error',
                '@typescript-eslint/consistent-type-imports': 'error',
                '@typescript-eslint/class-methods-use-this': [
                    'error',
                    {
                        ignoreOverrideMethods: true,
                        ignoreClassesThatImplementAnInterface: 'public-fields',
                    },
                ],
                '@typescript-eslint/explicit-function-return-type': [
                    'error',
                    {
                        allowExpressions: true,
                        allowTypedFunctionExpressions: true,
                        allowHigherOrderFunctions: true,
                    },
                ],
                '@typescript-eslint/explicit-module-boundary-types': [
                    'error',
                    {
                        allowDirectConstAssertionInArrowFunctions: true,
                        allowHigherOrderFunctions: true,
                        allowTypedFunctionExpressions: true,
                    },
                ],
                // Complexity and size are left to review, not capped
                '@typescript-eslint/max-params': 'off',
                '@typescript-eslint/member-ordering': [
                    'error',
                    {
                        default: [
                            'signature',
                            'static-field',
                            'instance-field',
                            'field',
                            'constructor',
                            // TODO public -> protected -> private
                            ['public-method', 'protected-method'],
                            'method',
                        ],
                    },
                ],
                '@typescript-eslint/naming-convention': ['error', ...baseNamingConvention],
                '@typescript-eslint/no-empty-interface': ['error', { allowSingleExtends: true }],
                // `any` is sometimes needed, e.g. for variance in a generic constraint; the `no-unsafe-*` rules still check how it's used
                '@typescript-eslint/no-explicit-any': 'off',
                '@typescript-eslint/no-extraneous-class': [
                    'error',
                    {
                        allowStaticOnly: true,
                    },
                ],
                '@typescript-eslint/no-floating-promises': [
                    'error',
                    {
                        checkThenables: true,
                    },
                ],
                // `void` is used in generic types, e.g. `Promise<void> | void`
                '@typescript-eslint/no-invalid-void-type': 'off',
                '@typescript-eslint/no-misused-promises': [
                    'error',
                    {
                        checksVoidReturn: false,
                        checksConditionals: true,
                    },
                ],
                '@typescript-eslint/no-namespace': [
                    'error',
                    {
                        allowDeclarations: false,
                        allowDefinitionFiles: false,
                    },
                ],
                // Deprecated, and type aliases are used throughout
                '@typescript-eslint/no-type-alias': 'off',
                // `!` is allowed where TypeScript can't narrow a value known to exist, though the fewer the better
                '@typescript-eslint/no-non-null-assertion': 'off',
                '@typescript-eslint/no-unnecessary-condition': [
                    'error',
                    { allowConstantLoopConditions: true },
                ],
                '@typescript-eslint/parameter-properties': [
                    'error',
                    {
                        allow: ['private readonly'],
                        prefer: 'class-property',
                    },
                ],
                '@typescript-eslint/prefer-destructuring': [
                    'error',
                    {
                        VariableDeclarator: { array: true, object: true },
                        // `unicorn/no-unreadable-array-destructuring` forbids destructuring into properties
                        AssignmentExpression: { array: false, object: true },
                    },
                ],
                '@typescript-eslint/prefer-nullish-coalescing': [
                    'error',
                    {
                        ignoreConditionalTests: true,
                        ignoreMixedLogicalExpressions: false,
                    },
                ],
                // Reports most parameters typed by a library, which can't be made readonly
                '@typescript-eslint/prefer-readonly-parameter-types': 'off',
                '@typescript-eslint/restrict-template-expressions': [
                    'error',
                    {
                        allowNumber: true,
                        allowBoolean: true,
                        allowAny: false,
                        allowNullish: false,
                    },
                ],
                '@typescript-eslint/sort-type-constituents': [
                    'error',
                    {
                        groupOrder: [
                            'literal',
                            'keyword',
                            'named',
                            'operator',
                            'import',
                            'object',
                            'tuple',
                            'function',
                            'conditional',
                            'intersection',
                            'union',
                            'nullish',
                        ],
                    },
                ],
                '@typescript-eslint/strict-boolean-expressions': [
                    'error',
                    {
                        allowString: true,
                        allowNumber: true,
                        allowNullableObject: true,
                        allowNullableBoolean: true,
                        allowNullableString: true,
                        allowNullableNumber: true,
                        allowAny: true,
                    },
                ],
                // Reports `promisify(exec)`: Node's callback APIs return a value where `promisify` expects none
                '@typescript-eslint/strict-void-return': 'off',
                '@typescript-eslint/switch-exhaustiveness-check': 'error',
                '@typescript-eslint/triple-slash-reference': [
                    'error',
                    {
                        path: 'never',
                        types: 'never',
                        lib: 'never',
                    },
                ],
                // TypeScript infers types; `explicit-module-boundary-types` requires them where they matter
                '@typescript-eslint/typedef': 'off',
                // An empty function is a no-op callback or default
                '@typescript-eslint/no-empty-function': 'off',
                '@typescript-eslint/no-magic-numbers': [
                    'error',
                    {
                        detectObjects: true,
                        enforceConst: true,
                        ignore: [-1, 0, '0n', 1, '1n', 2, '2n', 10],
                        ignoreArrayIndexes: true,
                        ignoreTypeIndexes: true,
                        ignoreReadonlyClassProperties: true,
                        ignoreEnums: true,
                    },
                ],
                // Assertions are left to review; `consistent-type-assertions` limits how they're written
                '@typescript-eslint/no-unsafe-type-assertion': 'off',
                '@typescript-eslint/no-unused-expressions': [
                    'error',
                    {
                        allowShortCircuit: true,
                        allowTernary: true,
                    },
                ],
                '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
                '@typescript-eslint/no-use-before-define': [
                    'error',
                    {
                        enums: false,
                        functions: false,
                        typedefs: false,
                    },
                ],
                // An async function without `await` still returns a promise, which callers may rely on
                '@typescript-eslint/require-await': 'off',

                // Import
                ...nonDeprecatedRules('import-x', importPlugin),
                'import-x/consistent-type-specifier-style': ['error', 'prefer-top-level'],
                // No bundler here reads webpack chunk names
                'import-x/dynamic-import-chunkname': 'off',
                // An export sits with what it exports
                'import-x/exports-last': 'off',
                // TypeScript checks import paths, which end in `.js` as Node.js ESM requires
                'import-x/extensions': 'off',
                // An export sits with what it exports
                'import-x/group-exports': 'off',
                // Complexity and size are left to review, not capped
                'import-x/max-dependencies': 'off',
                // TypeScript checks named imports, and this rule misses some packages' exports (e.g. `@tanstack/react-query`)
                'import-x/named': 'off',
                // TypeScript already checks namespace members, and this rule can't follow `export *` from CommonJS (e.g. mocha 12)
                'import-x/namespace': 'off',
                'import-x/newline-after-import': ['error', { count: 1 }],
                // Config files (e.g. `eslint.config.js`) and fixtures export a value directly
                'import-x/no-anonymous-default-export': 'off',
                // Allowed where a tool expects one, e.g. `eslint.config.js`
                'import-x/no-default-export': 'off',
                // Every imported package must be declared, including workspace packages (which `internal-regex`
                // marks internal), except the package itself. `src/` may not use `devDependencies`, see below
                'import-x/no-extraneous-dependencies': ['error', extraneousDependencies],
                // Subpath imports (`#internal/*`) and package subpaths are how packages share code
                'import-x/no-internal-modules': 'off',
                // Packages export by name
                'import-x/no-named-export': 'off',
                // Namespace imports (`import * as`) are allowed
                'import-x/no-namespace': 'off',
                // Packages run on Node.js
                'import-x/no-nodejs-modules': 'off',
                // Only check relative paths. Package and subpath (`#internal/*`) imports are the alternatives to `../`,
                // even when they resolve to a parent directory
                'import-x/no-relative-parent-imports': ['error', { ignore: ['^[^.]'] }],
                // A default import may be named for how it's used
                'import-x/no-rename-default': 'off',
                'import-x/no-unassigned-import': ['error', { allow: ['**/*.css'] }],
                // TypeScript resolves imports, including subpath imports this rule can't
                'import-x/no-unresolved': 'off',
                // Needs options, and TypeScript and the barrels decide what's exported
                'import-x/no-unused-modules': 'off',
                'import-x/no-useless-path-segments': ['error', { commonjs: true }],
                'import-x/order': [
                    'error',
                    {
                        alphabetize: { caseInsensitive: true, order: 'asc' },
                        groups: [
                            'type',
                            'builtin',
                            'external',
                            'internal',
                            'index',
                            'parent',
                            'sibling',
                            ['object', 'unknown'],
                        ],
                        'newlines-between-types': 'never',
                        'newlines-between': 'never',
                        pathGroups: [
                            {
                                pattern: String.raw`\#*{,/**}`,
                                group: 'internal',
                                position: 'after',
                            },
                        ],
                        sortTypesGroup: true,
                        warnOnUnassignedImports: true,
                    },
                ],
                // Packages export by name
                'import-x/prefer-default-export': 'off',

                // JS Doc
                ...nonDeprecatedRules('jsdoc', jsDocPlugin),
                // Doesn't work on ESLint 8+
                'jsdoc/check-examples': 'off',
                // `jsdoc/require-rejects` documents a promise's rejection with `@rejects`
                'jsdoc/check-tag-names': ['error', { definedTags: ['rejects'] }],
                // Descriptions indent nested lists and their continuation lines
                'jsdoc/check-indentation': ['error', { allowIndentedSections: true }],
                'jsdoc/check-param-names': [
                    'error',
                    {
                        checkDestructured: false,
                        disableMissingParamChecks: true,
                    },
                ],
                // Reads `package.json` from the working directory, which is the workspace root, not the file's package.
                // `import-x/no-extraneous-dependencies` checks each package's imports.
                'jsdoc/imports-as-dependencies': 'off',
                // Biome owns blank lines
                'jsdoc/lines-before-block': 'off',
                // A line comment explains code; JSDoc is for what's exported
                'jsdoc/convert-to-jsdoc-comments': 'off',
                // Needs options, and reports that on every file without them
                'jsdoc/match-name': 'off',
                // Needs options, and reports that on every file without them
                'jsdoc/no-missing-syntax': 'off',
                'jsdoc/no-multi-asterisks': [
                    'error',
                    {
                        preventAtEnd: true,
                        preventAtMiddleLines: true,
                    },
                ],
                // Needs options, and reports that on every file without them
                'jsdoc/no-restricted-syntax': 'off',
                // A description may be a phrase
                'jsdoc/require-description-complete-sentence': 'off',
                'jsdoc/require-description': [
                    'error',
                    {
                        checkConstructors: false,
                        descriptionStyle: 'body',
                    },
                ],
                // Examples live in READMEs and the docs site
                'jsdoc/require-example': 'off',
                // A file's exports describe it
                'jsdoc/require-file-overview': 'off',
                // https://github.com/gajus/eslint-plugin-jsdoc/issues/1189#issuecomment-1893647410
                'jsdoc/require-jsdoc': [
                    'error',
                    {
                        checkConstructors: false,
                        publicOnly: true,
                        require: {
                            ArrowFunctionExpression: false,
                            ClassDeclaration: true,
                            ClassExpression: true,
                            FunctionDeclaration: false,
                            FunctionExpression: false,
                            MethodDefinition: false,
                        },
                        contexts: [
                            'ExportDefaultDeclaration > ArrowFunctionExpression',
                            'ExportNamedDeclaration > ArrowFunctionExpression',
                            'ExportDefaultDeclaration > FunctionExpression',
                            'ExportNamedDeclaration > FunctionExpression',
                            // Expect JSDoc for TypeScript overloads which are not preceded by another overload
                            'TSDeclareFunction:not(TSDeclareFunction + TSDeclareFunction)',
                            // Expect JSDoc for regular function declarations which are not preceded by an overload
                            'FunctionDeclaration:not(TSDeclareFunction + FunctionDeclaration)',
                            // Attempt to avoid selecting anything but the first overloaded method declaration.
                            // May over ignore, but better to _allow_ opting into jsdoc, than _force_ opt-out.
                            'MethodDefinition:not(MethodDefinition + MethodDefinition)',
                        ],
                    },
                ],
                'jsdoc/require-param': [
                    'error',
                    {
                        checkDestructured: false,
                    },
                ],
                // TypeScript declares the types
                'jsdoc/require-param-type': 'off',
                // TypeScript declares the types
                'jsdoc/require-returns-type': 'off',
                // Needs options, and reports that on every file without them
                'jsdoc/require-tags': 'off',
                // Its fixed order of over 100 tags doesn't match how the repo writes them, and tag order carries no meaning
                'jsdoc/sort-tags': 'off',
                'jsdoc/tag-lines': [
                    'error',
                    'never',
                    {
                        applyToEndTag: false,
                        count: 1,
                        startLines: 1,
                        tags: {
                            example: { lines: 'always' },
                            see: { lines: 'always' },
                        },
                    },
                ],
                // Needs options, and reports that on every file without them
                'jsdoc/text-escaping': 'off',
                // Duplicates @typescript-eslint/ban-ts-comment
                'jsdoc/ts-ban-ts-comment': 'off',

                // JSX a11y
                ...nonDeprecatedRules('jsx-a11y', jsxA11yPlugin),
                'jsx-a11y/anchor-is-valid': [
                    'error',
                    {
                        components: ['Link'],
                        aspects: ['invalidHref', 'preferButton'],
                    },
                ],

                // Node
                ...nonDeprecatedRules('n', nodePlugin),
                'n/callback-return': ['error', ['callback', 'cb', 'next', 'done']],
                'n/no-missing-import': 'off', // Fails to detect .ts extension
                'n/no-missing-require': 'off', // Same
                'n/no-sync': ['error', { allowAtRootLevel: true }],
                'n/no-unsupported-features/node-builtins': [
                    'error',
                    {
                        allowExperimental: true,
                    },
                ],

                // React
                ...nonDeprecatedRules('react', reactPlugin),
                'react/boolean-prop-naming': ['error', { validateNested: true }],
                // Needs a list of what to forbid
                'react/forbid-dom-props': 'off',
                // Needs a list of what to forbid
                'react/forbid-elements': 'off',
                'react/function-component-definition': [
                    'error',
                    {
                        namedComponents: 'arrow-function',
                        unnamedComponents: 'arrow-function',
                    },
                ],
                'react/jsx-filename-extension': ['error', { extensions: ['.tsx'] }],
                'react/jsx-key': ['error', { checkFragmentShorthand: true }],
                // Text may be written directly in JSX
                'react/jsx-no-literals': 'off',
                'react/jsx-no-target-blank': [
                    'error',
                    { allowReferrer: false, enforceDynamicLinks: 'always' },
                ],
                'react/jsx-props-no-spreading': ['error', { exceptions: ['App', 'Component'] }],
                'react/jsx-sort-props': [
                    'error',
                    {
                        callbacksLast: true,
                        ignoreCase: true,
                        noSortAlphabetically: false,
                        reservedFirst: true,
                        shorthandFirst: true,
                    },
                ],
                'react/no-multi-comp': ['error', { ignoreStateless: true }],
                'react/no-unescaped-entities': [
                    'error',
                    {
                        forbid: [
                            {
                                char: '<',
                                alternatives: ['&lt;'],
                            },
                            {
                                char: '>',
                                alternatives: ['&gt;'],
                            },
                            {
                                char: "'",
                                alternatives: ['&apos;', '&lsquo;', '&rsquo;'],
                            },
                            {
                                char: '‘',
                                alternatives: ['&lsquo;'],
                            },
                            {
                                char: '’',
                                alternatives: ['&rsquo;'],
                            },
                            {
                                char: '"',
                                alternatives: ['&quot;', '&ldquo;', '&rdquo;'],
                            },
                            {
                                char: '“',
                                alternatives: ['&ldquo;'],
                            },
                            {
                                char: '”',
                                alternatives: ['&rdquo;'],
                            },
                            {
                                char: '{',
                                alternatives: ['&#123;'],
                            },
                            {
                                char: '}',
                                alternatives: ['&#125;'],
                            },
                        ],
                    },
                ],
                'react/no-unsafe': ['error', { checkAliases: true }],
                'react/no-will-update-set-state': ['error', 'disallow-in-func'],
                // The automatic JSX runtime doesn't need `React` in scope
                'react/react-in-jsx-scope': 'off',
                'react/static-property-placement': ['error', 'static public field'],

                // React Hooks
                ...nonDeprecatedRules('react-hooks', reactHooksPlugin),

                // Regexp
                ...nonDeprecatedRules('regexp', regexpPlugin),
                // `unicorn/prefer-unicode-code-point-escapes` writes `\u{7F}`, not `\x7f`
                'regexp/hexadecimal-escape': ['error', 'never'],
                // `unicorn/escape-case` writes escapes' hex digits in uppercase
                'regexp/letter-case': [
                    'error',
                    {
                        caseInsensitive: 'lowercase',
                        controlEscape: 'uppercase',
                        hexadecimalEscape: 'uppercase',
                        unicodeEscape: 'uppercase',
                    },
                ],

                // SonarJS
                ...nonDeprecatedRules('sonarjs', sonarPlugin),
                // Complexity and size are left to review, not capped
                'sonarjs/cognitive-complexity': 'off',
                // Complexity and size are left to review, not capped
                'sonarjs/cyclomatic-complexity': 'off',
                // False positives, e.g. a generic compared with `null`
                'sonarjs/different-types-comparison': 'off',
                // An `else if` chain may end without an `else`
                'sonarjs/elseif-without-else': 'off',
                // Complexity and size are left to review, not capped
                'sonarjs/expression-complexity': 'off',
                // Files have no header
                'sonarjs/file-header': 'off',
                // Complexity and size are left to review, not capped
                'sonarjs/max-lines': 'off',
                // Complexity and size are left to review, not capped
                'sonarjs/max-lines-per-function': 'off',
                // Complexity and size are left to review, not capped
                'sonarjs/max-union-size': 'off',
                // Complexity and size are left to review, not capped
                'sonarjs/nested-control-flow': 'off',
                // Repeating a string is often clearer than naming it
                'sonarjs/no-duplicate-string': 'off',
                // Doesn't see tests registered through a chain, e.g. mocha-chain's `beforeEach(...).test(...)`
                'sonarjs/no-empty-test-file': 'off',
                // Namespace imports (`import * as`) are allowed
                'sonarjs/no-wildcard-import': 'off',
                // Suggests chai property assertions (`.to.be.null`), which no-unused-expressions forbids
                'sonarjs/prefer-specific-assertions': 'off',
                // A TODO comment may record a known follow-up
                'sonarjs/todo-tag': 'off',

                // Unicorn
                // Every disable says why, after `--`. An `eslint-enable` only ends one.
                '@eslint-community/eslint-comments/require-description': [
                    'error',
                    { ignore: ['eslint-enable'] },
                ],
                ...nonDeprecatedRules('unicorn', unicornPlugin),
                'unicorn/catch-error-name': ['error', { ignore: [/^error$/v], name: 'err' }],
                // Contradicts `arrow-body-style`
                'unicorn/consistent-arrow-return-style': 'off',
                // Contradicts `@typescript-eslint/member-ordering`
                'unicorn/consistent-class-member-order': 'off',
                // Successor to `unicorn/prevent-abbreviations`
                'unicorn/name-replacements': 'off',
                // Documentation comments are JSDoc, which prefixes each line with an asterisk
                'unicorn/no-asterisk-prefix-in-documentation-comments': 'off',
                // Re-exporting entry points (`index.ts`, `bin.mjs`) is how packages expose their API, and what barrelify generates
                'unicorn/no-barrel-files': 'off',
                // Entry-script bins (`bin.mjs`) re-export their EntryScript as default
                'unicorn/no-exports-in-scripts': 'off',
                // Names such as `newDelta` and `classScore` are clear
                'unicorn/no-keyword-prefix': 'off',
                // Comments are wrapped to fit the line width
                'unicorn/no-manually-wrapped-comments': 'off',
                // `null` is JSON's empty value, and some APIs need it
                'unicorn/no-null': 'off',
                // `this` in functions is typed (`noImplicitThis`), and needed for Mocha contexts and wrappers that forward it
                'unicorn/no-this-outside-of-class': 'off',
                // `eslint.config.js` and other config modules export the result of a call
                'unicorn/no-top-level-side-effects': 'off',
                'unicorn/no-useless-undefined': ['error', { checkArguments: false }],
                'unicorn/numeric-separators-style': [
                    'error',
                    {
                        hexadecimal: {
                            groupLength: 8,
                        },
                    },
                ],
                'unicorn/prefer-export-from': ['error', { checkUsedVariables: false }],
                // Contradicts `unicorn/prefer-number-properties`
                'unicorn/prefer-global-number-constants': 'off',
                // `Iterator.concat` is not available in Node 24
                'unicorn/prefer-iterator-concat': 'off',
                'unicorn/prefer-ternary': ['error', 'only-single-line'],
                // Contradicts `@typescript-eslint/sort-type-constituents`
                'unicorn/prefer-type-literal-last': 'off',
                // `Uint8Array.fromBase64` and `Uint8Array#toBase64` are not available in Node 24
                'unicorn/prefer-uint8array-base64': 'off',
                // Deprecated for `unicorn/name-replacements`, which is off too
                'unicorn/prevent-abbreviations': 'off',
                'unicorn/template-indent': ['error', { indent: 4 }],
                // A complexity of 1 is too strict, and `try`/`finally` must wrap all the code it guards
                'unicorn/try-complexity': 'off',
            },
        },
        {
            // Disable type-checking rules for non-TS files.
            // Attempt to re-enable original rule as well.
            files: ['**/*.{c,m,}js'],
            rules: (() => {
                const rules: Linter.Config['rules'] = {};

                for (const [ruleName, ruleSettings] of Object.entries(typescriptPlugin.rules)) {
                    if (!ruleSettings.meta.docs.requiresTypeChecking) {
                        continue;
                    }
                    rules[`@typescript-eslint/${ruleName}`] = 'off';
                    const { extendsBaseRule } = ruleSettings.meta.docs;
                    if (typeof extendsBaseRule === 'string') {
                        rules[extendsBaseRule] = 'error';
                    } else if (extendsBaseRule) {
                        rules[ruleName] = 'error';
                    }
                }

                return rules;
            })(),
        },
        {
            // Disable rules that expect ESM syntax
            files: ['**/*.c{j,t}s{x,}'],
            rules: {
                '@typescript-eslint/no-require-imports': 'off',
                '@typescript-eslint/no-var-requires': 'off',
                'unicorn/prefer-top-level-await': 'off',
            },
        },
        {
            files: ['**/*.{c,m,}tsx'],
            rules: {
                '@typescript-eslint/naming-convention': [
                    'error',
                    ...baseNamingConvention,
                    ...reactComponentNamingConvention,
                ],
            },
        },
        {
            // Disable JSX rules for non-JSX files
            files: ['**/*.{c,m,}ts'],
            rules: (() => {
                const rules: Linter.Config['rules'] = {};

                for (const ruleName of [
                    ...Object.keys(jsxA11yPlugin.rules!).map(rule => `jsx-a11y/${rule}`),
                    ...Object.keys(reactPlugin.rules!).map(rule => `react/${rule}`),
                    ...Object.keys(reactHooksPlugin.rules!).map(rule => `react-hooks/${rule}`),
                ]) {
                    rules[ruleName] = 'off';
                }

                return rules;
            })(),
        },
        {
            // ESLint plugin code (by convention under an `eslint/` directory) names visitors after AST nodes, e.g. `Program`,
            // and rules in kebab-case
            files: ['**/eslint/**/*.{c,m,}ts'],
            rules: {
                '@typescript-eslint/naming-convention': [
                    'error',
                    ...baseNamingConvention,
                    {
                        selector: 'objectLiteralMethod',
                        format: ['camelCase', 'PascalCase'],
                    },
                    {
                        // Selectors, e.g. `'CallExpression > Identifier'`, and kebab-case rule names
                        selector: ['objectLiteralMethod', 'objectLiteralProperty', 'typeProperty'],
                        modifiers: ['requiresQuotes'],
                        format: null,
                    },
                ],
                'sonarjs/function-name': 'off',
            },
        },
        {
            // Published code (and its declarations) is used without `devDependencies` installed
            files: sourceFiles.map(glob => `src/${glob}`),
            rules: {
                'import-x/no-extraneous-dependencies': [
                    'error',
                    { ...extraneousDependencies, devDependencies: false, includeTypes: true },
                ],
            },
        },
        {
            // A CLI's entry point and its commands print their results to the terminal
            files: ['src/cli.{c,m,}ts', 'src/commands/**/*.{c,m,}ts'],
            rules: {
                'no-console': 'off',
            },
        },
        {
            // Disable "best practice" rules for tests
            files: ['test/**/*.{c,m,}ts{x,}'],
            rules: {
                'no-magic-numbers': 'off',
                '@typescript-eslint/explicit-function-return-type': 'off',
                '@typescript-eslint/no-magic-numbers': 'off',
                '@typescript-eslint/only-throw-error': 'off',
                'sonarjs/pseudo-random': 'off',
                // Tests build and assert values that are `undefined`, e.g. a `cause` that is present but undefined
                'sonarjs/no-undefined-assignment': 'off',
                'sonarjs/use-type-alias': 'off',
                'unicorn/consistent-function-scoping': 'off',
                // Fluent test setup (e.g. haywire's `bind(identifier(A).nullable())`) nests calls by design
                'unicorn/max-nested-calls': 'off',
            },
        },
        // Not in tests, which build fixtures freely (e.g. a schema per test)
        ...plugins.map(plugin => packagePluginConfig(plugin, sourceFiles, ['test/**'])),
        // Disable all formatting rules
        prettierConfig as unknown as Linter.Config,
    ] satisfies Linter.Config[];
}
