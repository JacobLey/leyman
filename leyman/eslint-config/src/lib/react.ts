import type { ESLint, Linter } from 'eslint';
import rawJsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import rawReactPlugin from 'eslint-plugin-react';
import rawReactHooksPlugin from 'eslint-plugin-react-hooks';
import { withLegacyRuleContext } from './legacy-rule-context.js';
import { nonDeprecatedRules } from './non-deprecated-rules.js';

/* eslint-disable @typescript-eslint/no-unsafe-assignment -- The plugins ship without types */
const jsxA11yPlugin: ESLint.Plugin = rawJsxA11yPlugin;
const reactPlugin: ESLint.Plugin = withLegacyRuleContext(rawReactPlugin);
const reactHooksPlugin: ESLint.Plugin = rawReactHooksPlugin;
/* eslint-enable @typescript-eslint/no-unsafe-assignment */

/**
 * What a package that depends on React adds to its config. Its own module, imported only for such a package: the
 * plugins and their dependencies are about a thousand modules that a package without React never needs.
 *
 * @returns The plugins, every rule set for them, and the rules to turn off outside JSX files
 */
export const loadReact = (): {
    offOutsideJsx: Linter.RulesRecord;
    plugins: Record<string, ESLint.Plugin>;
    rules: Linter.RulesRecord;
} => ({
    plugins: {
        'jsx-a11y': jsxA11yPlugin,
        react: reactPlugin,
        'react-hooks': reactHooksPlugin,
    },
    rules: {
        // JSX a11y
        ...nonDeprecatedRules('jsx-a11y', jsxA11yPlugin),
        'jsx-a11y/anchor-is-valid': [
            'error',
            {
                components: ['Link'],
                aspects: ['invalidHref', 'preferButton'],
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
    },
    offOutsideJsx: Object.fromEntries(
        [
            ...Object.keys(jsxA11yPlugin.rules!).map(rule => `jsx-a11y/${rule}`),
            ...Object.keys(reactPlugin.rules!).map(rule => `react/${rule}`),
            ...Object.keys(reactHooksPlugin.rules!).map(rule => `react-hooks/${rule}`),
        ].map(rule => [rule, 'off'] as const)
    ),
});
