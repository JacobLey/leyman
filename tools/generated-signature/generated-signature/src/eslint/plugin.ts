import type { ESLint, Linter } from 'eslint';
import { valid } from './rules/valid.js';

const NAMESPACE = 'generated-signature';

interface GeneratedSignaturePlugin extends ESLint.Plugin {
    meta: { name: string; namespace: typeof NAMESPACE };
    rules: { valid: typeof valid };
    configs: { recommended: Linter.Config };
}

/**
 * ESLint plugin, from the `generated-signature/eslint` entry point so the main entry point never
 * loads it. `eslint` is only used for types.
 */
const plugin: GeneratedSignaturePlugin = {
    meta: { name: 'generated-signature/eslint', namespace: NAMESPACE },
    rules: { valid },
    configs: {
        recommended: {
            rules: { [`${NAMESPACE}/valid`]: 'error' },
        },
    },
};
// The recommended config registers the plugin itself, so it can be used on its own.
plugin.configs.recommended.plugins = { [NAMESPACE]: plugin };

export default plugin;
