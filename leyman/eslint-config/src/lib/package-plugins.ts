import type { ESLint, Linter } from 'eslint';

/**
 * Turn on a package's ESLint plugin (e.g. `generated-signature/eslint`) with its recommended rules.
 *
 * Plugins are passed in by each project's `eslint.config.js` rather than imported here: every
 * package devDepends on this config, so depending on a package's plugin would be circular.
 *
 * @param plugin - plugin with `meta.namespace` and a flat `configs.recommended`
 * @param files - file patterns to apply the rules to
 * @param [ignores] - file patterns to leave out, e.g. tests
 * @returns flat config entry
 * @throws {TypeError} if the plugin lacks a namespace or a flat recommended config
 */
export const packagePluginConfig = (
    plugin: ESLint.Plugin,
    files: readonly string[],
    ignores: readonly string[] = []
): Linter.Config => {
    const namespace = plugin.meta?.namespace;
    if (!namespace) {
        throw new TypeError(
            `ESLint plugin ${plugin.meta?.name ?? '<unnamed>'} has no meta.namespace`
        );
    }
    const recommended = plugin.configs?.recommended;
    // Legacy (eslintrc) configs have `extends`/`env`, flat configs are plain objects or arrays.
    if (!recommended || Array.isArray(recommended) || 'extends' in recommended) {
        throw new TypeError(`ESLint plugin ${namespace} has no flat configs.recommended object`);
    }
    return {
        files: [...files],
        ignores: [...ignores],
        plugins: { [namespace]: plugin },
        rules: recommended.rules as Linter.RulesRecord,
    };
};
