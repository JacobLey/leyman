import type { ESLint } from 'eslint';
import rawCommentsPlugin from '@eslint-community/eslint-plugin-eslint-comments';
import rawPrettierConfig from 'eslint-config-prettier';
import rawImportPlugin from 'eslint-plugin-import-x';
import rawJsDocPlugin from 'eslint-plugin-jsdoc';
import rawNodePlugin from 'eslint-plugin-n';
import rawRegexpPlugin from 'eslint-plugin-regexp';
import rawSonarPlugin from 'eslint-plugin-sonarjs';
import rawUnicornPlugin from 'eslint-plugin-unicorn';

export { default as eslintConfig } from '@eslint/js';

/* eslint-disable @typescript-eslint/no-unsafe-assignment -- The plugins ship without types */
export const commentsPlugin: ESLint.Plugin = rawCommentsPlugin;
export const prettierConfig: ESLint.Plugin = rawPrettierConfig;
export const importPlugin: ESLint.Plugin = rawImportPlugin;
export const jsDocPlugin: ESLint.Plugin = rawJsDocPlugin;
export const nodePlugin: ESLint.Plugin = rawNodePlugin;
export const regexpPlugin: ESLint.Plugin = rawRegexpPlugin;
export const sonarPlugin: ESLint.Plugin = rawSonarPlugin;
export const unicornPlugin: ESLint.Plugin = rawUnicornPlugin;
