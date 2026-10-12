import type { ESLint } from 'eslint';

interface RuleContext {
    cwd: string;
    filename: string;
    physicalFilename: string;
    sourceCode: unknown;
}

/**
 * Add the rule context members that ESLint 10 removed, after deprecating them in favour of the properties they read.
 *
 * @param context - rule context from ESLint
 * @returns context with the removed members
 */
const withLegacyMembers = <Context extends RuleContext>(context: Context): Context =>
    // ESLint freezes the context, so add to a copy that inherits the rest, as ESLint builds the context itself
    Object.freeze(
        Object.create(context, {
            getCwd: { value: () => context.cwd },
            getFilename: { value: () => context.filename },
            getPhysicalFilename: { value: () => context.physicalFilename },
            getSourceCode: { value: () => context.sourceCode },
        }) as Context
    );

/**
 * Restore the rule context members that ESLint 10 removed, for a plugin that still calls them.
 *
 * `eslint-plugin-react` has no release supporting ESLint 10 yet (jsx-eslint/eslint-plugin-react#4022),
 * and some of its rules (e.g. `jsx-filename-extension`, `forward-ref-uses-ref`) throw without these.
 *
 * @param plugin - plugin whose rules call the removed members
 * @returns copy of the plugin, with each rule given a context that has them
 */
export const withLegacyRuleContext = (plugin: ESLint.Plugin): ESLint.Plugin => ({
    ...plugin,
    rules: Object.fromEntries(
        Object.entries(plugin.rules!).map(([name, rule]) => [
            name,
            { ...rule, create: context => rule.create(withLegacyMembers(context)) },
        ])
    ),
});
