import type { ESLint } from 'eslint';
import rawCommentsPlugin from '@eslint-community/eslint-plugin-eslint-comments';
import rawPrettierConfig from 'eslint-config-prettier';
import rawImportPlugin from 'eslint-plugin-import-x';
import rawJsDocPlugin from 'eslint-plugin-jsdoc';
import rawJsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import rawNodePlugin from 'eslint-plugin-n';
import rawReactPlugin from 'eslint-plugin-react';
import rawReactHooksPlugin from 'eslint-plugin-react-hooks';
import rawRegexpPlugin from 'eslint-plugin-regexp';
import rawSonarPlugin from 'eslint-plugin-sonarjs';
import rawUnicornPlugin from 'eslint-plugin-unicorn';
import { withAbstractErrors } from './abstract-errors.js';
import { withLegacyRuleContext } from './legacy-rule-context.js';

export { default as eslintConfig } from '@eslint/js';

/* eslint-disable @typescript-eslint/no-unsafe-assignment -- The plugins ship without types */
export const commentsPlugin: ESLint.Plugin = rawCommentsPlugin;
export const prettierConfig: ESLint.Plugin = rawPrettierConfig;
export const importPlugin: ESLint.Plugin = rawImportPlugin;
export const jsDocPlugin: ESLint.Plugin = rawJsDocPlugin;
export const jsxA11yPlugin: ESLint.Plugin = rawJsxA11yPlugin;
export const nodePlugin: ESLint.Plugin = rawNodePlugin;
export const reactPlugin: ESLint.Plugin = withLegacyRuleContext(rawReactPlugin);
export const reactHooksPlugin: ESLint.Plugin = rawReactHooksPlugin;
export const regexpPlugin: ESLint.Plugin = rawRegexpPlugin;
export const sonarPlugin: ESLint.Plugin = rawSonarPlugin;
export const unicornPlugin: ESLint.Plugin = withAbstractErrors(rawUnicornPlugin);
