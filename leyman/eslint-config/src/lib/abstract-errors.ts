import type { ESLint, Rule } from 'eslint';

/**
 * A node, as reported, with the parent ESLint sets and the `abstract` flag the TypeScript parser sets on a class.
 */
interface ReportedNode {
    readonly type: string;
    readonly abstract?: boolean;
    readonly parent?: ReportedNode | null;
}

/**
 * @param node - Node a report is about
 * @returns Whether it is, or is in, an abstract class
 */
const isInAbstractClass = (node: ReportedNode | undefined): boolean => {
    for (let current = node; current; current = current.parent ?? undefined) {
        // A class expression can't be abstract, and the rule doesn't check them
        if (current.type === 'ClassDeclaration') {
            return current.abstract === true;
        }
    }
    return false;
};

/**
 * Let `unicorn/custom-error-definition` skip abstract classes. An abstract base error is never thrown itself, so
 * its subclasses set the `name` and message, which the rule still checks on each of them.
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
                                        const node =
                                            'node' in descriptor
                                                ? (descriptor.node as ReportedNode)
                                                : undefined;
                                        if (!isInAbstractClass(node)) {
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
