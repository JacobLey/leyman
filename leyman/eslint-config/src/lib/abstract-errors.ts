import type { ESLint, Rule } from 'eslint';

/**
 * A node, as reported, with the parent ESLint sets, and the `abstract` flag the TypeScript parser sets on a class.
 */
interface ReportedNode {
    readonly type: string;
    readonly abstract?: boolean;
    readonly parent: ReportedNode;
}

/**
 * The class a report is about. The rule only reports on a class, or a node in one.
 *
 * @param node - Node the report is about
 * @returns The class declaration it is, or is in
 */
const classOf = (node: ReportedNode): ReportedNode =>
    node.type === 'ClassDeclaration' ? node : classOf(node.parent);

/**
 * Let `unicorn/custom-error-definition` skip abstract classes. An abstract base error is never thrown itself, so
 * its subclasses set the `name` and message, which the rule still checks on each of them.
 *
 * Temporary: unicorn merged the same behavior upstream (https://github.com/sindresorhus/eslint-plugin-unicorn/commit/ee3501fb1e0e724343c31b33ec463a330da829e6).
 * Delete this once a release with it is at least 7 days old, see `plans/eslint-rules.md`.
 *
 * @param plugin - `eslint-plugin-unicorn`
 * @returns copy of the plugin, whose `custom-error-definition` ignores abstract classes
 */
export const withAbstractErrors = (plugin: ESLint.Plugin): ESLint.Plugin => {
    const rule = plugin.rules!['custom-error-definition']!;
    return {
        ...plugin,
        rules: {
            ...plugin.rules,
            'custom-error-definition': {
                ...rule,
                create: context =>
                    rule.create(
                        // ESLint freezes the context, so override `report` on a copy that inherits the rest
                        Object.freeze(
                            Object.create(context, {
                                report: {
                                    value: (descriptor: Rule.ReportDescriptor) => {
                                        const { node } = descriptor as unknown as {
                                            readonly node: ReportedNode;
                                        };
                                        if (classOf(node).abstract !== true) {
                                            context.report(descriptor);
                                        }
                                    },
                                },
                            }) as Rule.RuleContext
                        )
                    ),
            },
        },
    };
};
