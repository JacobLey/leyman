import type { ESLint } from 'eslint';
import rawPrettierConfig from 'eslint-config-prettier';
import rawImportPlugin from 'eslint-plugin-import';
import rawJsDocPlugin from 'eslint-plugin-jsdoc';
import rawJsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import rawNodePlugin from 'eslint-plugin-n';
import rawReactPlugin from 'eslint-plugin-react';
import rawReactHooksPlugin from 'eslint-plugin-react-hooks';
import rawSonarPlugin from 'eslint-plugin-sonarjs';
import rawUnicornPlugin from 'eslint-plugin-unicorn';

export { default as eslintConfig } from '@eslint/js';

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
export const prettierConfig: ESLint.Plugin = rawPrettierConfig;
export const importPlugin: ESLint.Plugin = rawImportPlugin;
export const jsDocPlugin: ESLint.Plugin = rawJsDocPlugin;
export const jsxA11yPlugin: ESLint.Plugin = rawJsxA11yPlugin;
export const nodePlugin: ESLint.Plugin = rawNodePlugin;
export const reactPlugin: ESLint.Plugin = rawReactPlugin;
export const reactHooksPlugin: ESLint.Plugin = rawReactHooksPlugin;
export const sonarPlugin: ESLint.Plugin = rawSonarPlugin;
export const unicornPlugin: ESLint.Plugin = rawUnicornPlugin;
