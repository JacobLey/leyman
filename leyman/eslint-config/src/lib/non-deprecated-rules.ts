import type { RuleModule } from '@typescript-eslint/utils/ts-eslint';
import type { Linter, Rule } from 'eslint';

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
/**
 * Turns on every rule of a plugin that isn't deprecated and applies to JavaScript.
 *
 * @param name - the plugin's prefix, e.g. `import-x`
 * @param plugin - its rules
 * @param skip - rules left unset, so off. For a rule only some versions of the plugin define, as ESLint rejects a
 * setting for a rule the installed version doesn't have.
 * @returns each rule, as `error`
 */
export const nonDeprecatedRules = (
    name: string,
    plugin: PluginRules,
    skip: readonly string[] = []
): Linter.RulesRecord => {
    const rules: Linter.RulesRecord = {};
    for (const [ruleName, rule] of Object.entries(plugin.rules!)) {
        if (
            typeof rule === 'object' &&
            !skip.includes(ruleName) &&
            (rule.meta?.deprecated ?? false) === false &&
            isForJavaScript(rule)
        ) {
            rules[`${name}/${ruleName}`] = 'error';
        }
    }
    return rules;
};
