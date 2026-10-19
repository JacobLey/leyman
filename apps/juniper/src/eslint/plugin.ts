import type { ESLint, Linter } from 'eslint';
import { topLevelSchema } from './rules/top-level-schema.js';

const NAMESPACE = 'juniper';

interface JuniperPlugin extends ESLint.Plugin {
    meta: { name: string; namespace: typeof NAMESPACE };
    rules: { 'top-level-schema': typeof topLevelSchema };
    configs: { recommended: Linter.Config };
}

/**
 * ESLint plugin, from the `juniper/eslint` entry point so the main entry point never loads it.
 * `eslint` is only used for types.
 */
const plugin: JuniperPlugin = {
    meta: { name: 'juniper/eslint', namespace: NAMESPACE },
    rules: { 'top-level-schema': topLevelSchema },
    configs: {
        recommended: {
            rules: { [`${NAMESPACE}/top-level-schema`]: 'error' },
        },
    },
};
// The recommended config registers the plugin itself, so it can be used on its own.
plugin.configs.recommended.plugins = { [NAMESPACE]: plugin };

export default plugin;
