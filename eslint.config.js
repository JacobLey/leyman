import eslintConfig from "@eslint/js";
import nextPlugin from '@next/eslint-plugin-next';
import typescriptPlugin from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import jsDocPlugin from 'eslint-plugin-jsdoc';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import nodePlugin from 'eslint-plugin-n';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import sonarPlugin from 'eslint-plugin-sonarjs';
import unicornPlugin from 'eslint-plugin-unicorn';

export const nonDeprecatedRules = (name, plugin) => {
    const rules = {};
    for (const [ruleName, rule] of Object.entries(plugin.rules)) {
        if (rule.meta?.deprecated !== true) {
            rules[`${name}/${ruleName}`] = 'error';
        }
    }
    return rules;
};

// https://github.com/typescript-eslint/typescript-eslint/blob/master/packages/eslint-plugin/docs/rules/naming-convention.md
export const baseNamingConvention = [
    {
        selector: 'default',
        format: ['camelCase'],
        leadingUnderscore: 'forbid',
        trailingUnderscore: 'forbid',
        filter: {
            regex: '^Ajv$',
            match: false,
        },
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
];

export default [
    {
        ignores: [
            ".nyc_output",
            ".nyc-cache",
            "coverage",
            "dist",
            "nyc",
        ],
    },
    {
        files: [
            "**/*.{c,m,}ts{x,}",
            "**/*.{c,m,}js",
        ],
        languageOptions: {
            ecmaVersion: 'latest',
            parser: typescriptParser,
            parserOptions: {
                ecmaVersion: 'latest',
                EXPERIMENTAL_useProjectService: true,
            },
        },
        linterOptions: {
            reportUnusedDisableDirectives: true,
        },
        plugins: {
            '@next/next': nextPlugin,
            '@typescript-eslint': typescriptPlugin,
            'import': importPlugin,
            'jsdoc': jsDocPlugin,
            'jsx-a11y': jsxA11yPlugin,
            'n': nodePlugin,
            'react': reactPlugin,
            'react-hooks': reactHooksPlugin,
            'sonarjs': sonarPlugin,
            'unicorn': unicornPlugin,
        },
        settings: {
            react: {
                version: '18.2.0',
            },
        },
        rules: {
            ...eslintConfig.configs.all.rules,
            'accessor-pairs': 'off',
            'arrow-body-style': ['error', 'as-needed'],
            'camelcase': 'off',
            'capitalized-comments': [
                'error',
                'always',
                {
                    ignoreConsecutiveComments: true,
                    ignoreInlineComments: true,
                    ignorePattern: '\\w+:',
                },
            ],
            'class-methods-use-this': 'off',
            'complexity': 'off',
            'consistent-this': ['error', 'self'],
            'func-names': ['error', 'never'],
            'func-style': [
                'error',
                'expression',
                { allowArrowFunctions: true },
            ],
            'id-blacklist': 'off',
            'id-length': 'off',
            'id-match': 'off',
            'line-comment-position': 'off',
            'max-classes-per-file': 'off',
            'max-depth': 'off',
            'max-lines': 'off',
            'max-lines-per-function': 'off',
            'max-params': 'off',
            'max-statements': 'off',
            'multiline-comment-style': ['error', 'separate-lines'],
            'new-cap': ['error', { capIsNew: false }],
            'no-await-in-loop': 'off',
            'no-constant-condition': ['error', { checkLoops: false }],
            'no-continue': 'off',
            'no-empty': ['error', { allowEmptyCatch: true }],
            'no-implicit-coercion': ['error', { allow: ['!!'] }],
            'no-inline-comments': 'off',
            'no-plusplus': 'off',
            'no-restricted-imports': 'off',
            'no-restricted-modules': 'off',
            'no-restricted-properties': 'off',
            'no-restricted-syntax': [
                'error',
                {
                    selector: 'TSEnumDeclaration:not([const=true])',
                    message: 'Don\'t declare non-const enums',
                },
                {
                    selector: 'LabeledStatement',
                    message: 'Labels are a form of GOTO; using them makes code ' +
                        'confusing and hard to maintain and understand.',
                },
            ],
            'no-ternary': 'off',
            'no-undefined': 'off',
            'no-underscore-dangle': 'off',
            'no-void': ['error', { allowAsStatement: true }],
            'no-warning-comments': 'off',
            'one-var': ['error', 'never'],
            'prefer-const': [
                'error',
                {
                    destructuring: 'all',
                    ignoreReadBeforeAssign: true,
                },
            ],
            'prefer-destructuring': 'off',
            'sort-imports': [
                'error',
                {
                    ignoreCase: true,
                    ignoreDeclarationSort: true,
                },
            ],
            'sort-keys': 'off',
            'spaced-comment': [
                'error',
                'always',
                {
                    exceptions: ['*'],
                    markers: ['!'],
                },
            ],
            'vars-on-top': 'off',

            // NextJS
            ...nonDeprecatedRules('@next/next', nextPlugin),
            '@next/next/no-html-link-for-pages': 'off',

            // Typescript
            ...nonDeprecatedRules('@typescript-eslint', typescriptPlugin),
            '@typescript-eslint/ban-ts-comment': [
                'error', {
                    'ts-expect-error': true,
                    'ts-ignore': true,
                    'ts-nocheck': true,
                    'ts-check': true,
                },
            ],
            '@typescript-eslint/consistent-type-assertions': [
                'error',
                {
                    assertionStyle: 'as',
                    objectLiteralTypeAssertions: 'allow-as-parameter',
                },
            ],
            '@typescript-eslint/explicit-function-return-type': [
                'error', {
                    allowExpressions: true,
                    allowTypedFunctionExpressions: true,
                    allowHigherOrderFunctions: true,
                },
            ],
            '@typescript-eslint/explicit-module-boundary-types': [
                'error', {
                    allowDirectConstAssertionInArrowFunctions: true,
                    allowHigherOrderFunctions: true,
                    allowTypedFunctionExpressions: true,
                },
            ],
            '@typescript-eslint/lines-between-class-members': 'off',
            '@typescript-eslint/member-ordering': [
                'error', {
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
            '@typescript-eslint/naming-convention': [
                'error',
                ...baseNamingConvention,
            ],
            '@typescript-eslint/no-dynamic-delete': 'off',
            '@typescript-eslint/no-empty-interface': [
                'error',
                { allowSingleExtends: true },
            ],
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-extraneous-class': [
                'error', {
                    allowStaticOnly: true,
                },
            ],
            '@typescript-eslint/no-implicit-any-catch': 'off',
            '@typescript-eslint/no-invalid-void-type': 'off',
            '@typescript-eslint/no-misused-promises': [
                'error', {
                    checksVoidReturn: false,
                    checksConditionals: true,
                },
            ],
            '@typescript-eslint/no-namespace': [
                'error', {
                    allowDeclarations: false,
                    allowDefinitionFiles: false,
                },
            ],
            '@typescript-eslint/no-non-null-assertion': 'off',
            '@typescript-eslint/no-type-alias': [
                'error',
                {
                    allowAliases: 'always',
                    allowCallbacks: 'always',
                    allowConditionalTypes: 'always',
                    allowGenerics: 'always',
                    allowLiterals: 'in-unions-and-intersections',
                    allowMappedTypes: 'always',
                },
            ],
            '@typescript-eslint/no-unnecessary-condition': ['error', { allowConstantLoopConditions: true }],
            '@typescript-eslint/prefer-nullish-coalescing': [
                'error', {
                    ignoreConditionalTests: true,
                    ignoreMixedLogicalExpressions: false,
                },
            ],
            '@typescript-eslint/prefer-readonly-parameter-types': 'off',
            '@typescript-eslint/prefer-reduce-type-parameter': 'off',
            '@typescript-eslint/restrict-template-expressions': [
                'error', {
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
                'error', {
                    allowString: true,
                    allowNumber: true,
                    allowNullableObject: true,
                    allowNullableBoolean: true,
                    allowNullableString: true,
                    allowNullableNumber: true,
                    allowAny: true,
                },
            ],
            '@typescript-eslint/switch-exhaustiveness-check': 'error',
            '@typescript-eslint/triple-slash-reference': [
                'error', {
                    path: 'never',
                    types: 'never',
                    lib: 'never',
                },
            ],
            '@typescript-eslint/typedef': 'off',
            '@typescript-eslint/init-declarations': 'off',
            '@typescript-eslint/no-empty-function': 'off',
            '@typescript-eslint/no-magic-numbers': 'off',
            '@typescript-eslint/no-unused-expressions': [
                'error',
                {
                    allowShortCircuit: true,
                    allowTernary: true,
                },
            ],
            '@typescript-eslint/no-unused-vars': [
                'error',
                { ignoreRestSiblings: true },
            ],
            '@typescript-eslint/no-use-before-define': [
                'error', {
                    enums: false,
                    functions: false,
                    typedefs: false,
                },
            ],
            '@typescript-eslint/require-await': 'off',

            // Import
            ...nonDeprecatedRules('import', importPlugin),
            'import/dynamic-import-chunkname': 'off',
            'import/exports-last': 'off',
            'import/extensions': ['error', 'always', { ignorePackages: true }],
            'import/first': ['error', 'absolute-first'],
            'import/group-exports': 'off',
            'import/max-dependencies': 'off',
            'import/newline-after-import': ['error', { count: 1 }],
            'import/no-anonymous-default-export': 'off',
            'import/no-commonjs': 'off',
            'import/no-default-export': 'off',
            'import/no-extraneous-dependencies': 'off',
            'import/no-internal-modules': 'off',
            'import/no-mutable-exports': 'off',
            'import/no-named-as-default-member': 'off',
            'import/no-named-export': 'off',
            'import/no-namespace': 'off',
            'import/no-nodejs-modules': 'off',
            'import/no-unassigned-import': ['error', { allow: ['**/*.css'] }],
            'import/no-unresolved': 'off',
            'import/no-unused-modules': 'off',
            'import/no-useless-path-segments': ['error', { commonjs: true }],
            'import/order': [
                'error',
                {
                    'alphabetize': { caseInsensitive: true, order: 'asc' },
                    'groups': [
                        'builtin',
                        'external',
                        'internal',
                        'index',
                        'parent',
                        'sibling',
                        ['object', 'unknown'],
                    ],
                    'newlines-between': 'never',
                    'pathGroups': [
                        {
                            pattern: '\\#*',
                            group: 'internal',
                            position: 'after',
                        },
                    ],
                    'warnOnUnassignedImports': true,
                },
            ],
            'import/prefer-default-export': 'off',

            // JS Doc
            ...nonDeprecatedRules('jsdoc', jsDocPlugin),
            'jsdoc/check-examples': 'off',
            'jsdoc/check-indentation': [
                'error',
                {
                    excludeTags: ['example', 'param', 'returns'],
                },
            ],
            'jsdoc/match-name': 'off',
            'jsdoc/no-defaults': 'off',
            'jsdoc/no-missing-syntax': 'off',
            'jsdoc/no-multi-asterisks': [
                'error',
                {
                    preventAtEnd: true,
                    preventAtMiddleLines: true,
                },
            ],
            'jsdoc/no-restricted-syntax': 'off',
            'jsdoc/no-types': 'off',
            'jsdoc/no-undefined-types': 'off',
            'jsdoc/require-description-complete-sentence': 'off',
            'jsdoc/require-description': [
                'error',
                { descriptionStyle: 'body' },
            ],
            'jsdoc/require-example': 'off',
            'jsdoc/require-file-overview': 'off',
            'jsdoc/require-jsdoc': [
                'error',
                {
                    require: {
                        ArrowFunctionExpression: false,
                        ClassDeclaration: true,
                        ClassExpression: true,
                        FunctionDeclaration: true,
                        FunctionExpression: false,
                        MethodDefinition: true,
                    },
                    contexts: [
                        'ExportDefaultDeclaration > ArrowFunctionExpression',
                        'ExportNamedDeclaration > ArrowFunctionExpression',
                        'ExportDefaultDeclaration > FunctionExpression',
                        'ExportNamedDeclaration > FunctionExpression',
                    ],
                },
            ],
            'jsdoc/sort-tags': 'off',
            'jsdoc/tag-lines': [
                'error',
                'never',
                {
                    count: 1,
                    tags: {
                        example: { lines: 'always' },
                        see: { lines: 'always' },
                    },
                },
            ],

            // JSX a11y
            ...nonDeprecatedRules('jsx-a11y', jsxA11yPlugin),
            'jsx-a11y/click-events-have-key-events': 'off',
            'jsx-a11y/anchor-is-valid': [
                'error', {
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
            'n/no-unpublished-import': 'off',
            'n/no-unpublished-require': 'off',

            // React
            ...nonDeprecatedRules('react', reactPlugin),
            'react/boolean-prop-naming': ['error', { validateNested: true }],
            'react/destructuring-assignment': 'off',
            'react/display-name': 'off',
            'react/forbid-dom-props': 'off',
            'react/forbid-elements': 'off',
            'react/function-component-definition': [
                'error',
                {
                    namedComponents: 'arrow-function',
                    unnamedComponents: 'arrow-function',
                },
            ],
            'react/hook-use-state': 'off',
            'react/jsx-filename-extension': ['error', { extensions: ['.tsx'] }],
            'react/jsx-key': ['error', { checkFragmentShorthand: true }],
            'react/jsx-max-depth': 'off',
            'react/jsx-no-literals': 'off',
            'react/jsx-no-target-blank': ['error', { allowReferrer: false, enforceDynamicLinks: 'always' }],
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
                            char: '\'',
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
            'react/prop-types': 'off',
            'react/react-in-jsx-scope': 'off',
            'react/require-default-props': 'off',
            'react/static-property-placement': ['error', 'static public field'],

            // React Hooks
            ...nonDeprecatedRules('react-hooks', reactHooksPlugin),

            // SonarJS
            ...nonDeprecatedRules('sonarjs', sonarPlugin),
            'sonarjs/cognitive-complexity': 'off',
            'sonarjs/elseif-without-else': 'off',
            'sonarjs/no-duplicate-string': 'off',
            'sonarjs/no-identical-functions': 'off',
            'sonarjs/no-small-switch': 'off',

            // Unicorn
            ...nonDeprecatedRules('unicorn', unicornPlugin),
            'unicorn/catch-error-name': ['error', { ignore: [/^error$/u], name: 'err' }],
            'unicorn/import-index': ['error', { ignoreImports: true }],
            'unicorn/no-keyword-prefix': 'off',
            'unicorn/no-null': 'off',
            'unicorn/numeric-separators-style': [
                'error',
                {
                    hexadecimal: {
                        groupLength: 8,
                    },
                },
            ],
            'unicorn/prefer-export-from': ['error', { ignoreUsedVariables: true }],
            'unicorn/prefer-ternary': ['error', 'only-single-line'],
            'unicorn/prevent-abbreviations': 'off',
            'unicorn/template-indent': [
                'error',
                { indent: 4 },
            ],
            'unicorn/text-encoding-identifier-case': 'off',
        },
    },
    {
        // Disable type-checking rules for non-TS files.
        // Attempt to re-enable original rule as well.
        files: ['**/*.{c,m,}js'],
        rules: Object.entries(typescriptPlugin.rules).reduce(
            (rules, [ruleName, ruleSettings]) => {
                if (ruleSettings.meta.docs.requiresTypeChecking) {
                    rules[`@typescript-eslint/${ruleName}`] = 'off';
                    const { extendsBaseRule } = ruleSettings.meta.docs;
                    if (extendsBaseRule) {
                        if (typeof extendsBaseRule === 'string') {
                            rules[extendsBaseRule] = 'error';
                        } else {
                            rules[ruleName] = 'error';
                        }
                    }
                }
                return rules;
            },
            {}
        ),
    },
    {
        // Disable rules that expect ESM syntax
        files: ['**/*.cjs'],
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/no-var-requires': 'off',
        },
    },
    {
        // Disable JSX rules for non-JSX files
        files: ["**/*.{c,m,}ts"],
        rules: [
            ...Object.keys(jsxA11yPlugin.rules).map(rule => `jsx-a11y/${rule}`),
            ...Object.keys(reactPlugin.rules).map(rule => `react/${rule}`),
            ...Object.keys(reactHooksPlugin.rules).map(rule => `react-hooks/${rule}`),
        ].reduce((rules, ruleName) => {
            rules[ruleName] = 'off';
            return rules;
        }, {})
    },
    // Disable all formatting rules
    prettierConfig
];
