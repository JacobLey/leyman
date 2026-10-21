import type { Rule, Scope } from 'eslint';

/**
 * Factories that build a new schema, by the name juniper exports them under.
 */
const factories: ReadonlySet<string> = new Set([
    'arraySchema',
    'booleanSchema',
    'customSchema',
    'defineRecursive',
    'enumSchema',
    'mergeSchema',
    'neverSchema',
    'nullSchema',
    'numberSchema',
    'objectSchema',
    'stringSchema',
    'tupleSchema',
]);

/**
 * Classes whose static `create` builds a new schema.
 */
const classes: ReadonlySet<string> = new Set([
    'ArraySchema',
    'BooleanSchema',
    'CustomSchema',
    'EnumSchema',
    'MergeSchema',
    'NeverSchema',
    'NullSchema',
    'NumberSchema',
    'ObjectSchema',
    'RecursiveSchema',
    'StringSchema',
    'TupleSchema',
]);

// From `eslint`'s own types, so `estree` types aren't a dependency
type CallExpression = Parameters<NonNullable<Rule.RuleListener['CallExpression']>>[0];
type Node = Rule.Node;
type Identifier = Extract<Node, { type: 'Identifier' }>;

/**
 * Name `juniper` exports a variable under, if the variable is imported from it.
 *
 * @param variable - resolved variable
 * @returns exported name, `*` for a namespace import, or `null`
 */
const juniperImport = (variable: Scope.Variable | null | undefined): string | null => {
    const definition = variable?.defs[0];
    if (definition?.type !== 'ImportBinding' || definition.parent.source.value !== 'juniper') {
        return null;
    }
    const { node } = definition;
    if (node.type === 'ImportNamespaceSpecifier') {
        return '*';
    }
    return node.type === 'ImportSpecifier' && node.imported.type === 'Identifier'
        ? node.imported.name
        : null;
};

const functionTypes: ReadonlySet<string> = new Set([
    'ArrowFunctionExpression',
    'FunctionDeclaration',
    'FunctionExpression',
]);

/**
 * Report juniper schemas built inside a function (or per class instance), rather than once at
 * module scope.
 */
export const topLevelSchema: Rule.RuleModule = {
    meta: {
        type: 'problem',
        docs: {
            description: 'Require juniper schemas to be built at module scope',
            url: 'https://jacobley.github.io/leyman/juniper/guides/eslint#juniper-top-level-schema',
        },
        messages: {
            topLevel:
                'Build juniper schemas once, at module scope, not on every call. Move `{{ name }}()` to the top level.',
        },
        schema: [],
    },
    create: context => {
        const { sourceCode } = context;

        /**
         * The juniper factory a call builds a schema with, if it does.
         *
         * @param call - call expression
         * @returns factory name, for the message, or `null`
         */
        const factoryOf = (call: CallExpression): string | null => {
            const { callee } = call;
            const scope = sourceCode.getScope(call);
            const resolve = (identifier: Omit<Identifier, 'parent'>): string | null =>
                juniperImport(
                    scope.references.find(reference => reference.identifier === identifier)
                        ?.resolved
                );
            if (callee.type === 'Identifier') {
                const imported = resolve(callee);
                return imported !== null && factories.has(imported) ? imported : null;
            }
            if (
                callee.type !== 'MemberExpression' ||
                callee.computed ||
                callee.property.type !== 'Identifier'
            ) {
                return null;
            }
            const { object, property } = callee;
            if (object.type === 'Identifier') {
                const imported = resolve(object);
                // `juniper.objectSchema()`, or `ObjectSchema.create()`
                if (imported === '*' && factories.has(property.name)) {
                    return property.name;
                }
                return imported !== null && classes.has(imported) && property.name === 'create'
                    ? `${imported}.create`
                    : null;
            }
            // `juniper.ObjectSchema.create()`
            if (
                object.type === 'MemberExpression' &&
                !object.computed &&
                object.object.type === 'Identifier' &&
                object.property.type === 'Identifier' &&
                classes.has(object.property.name) &&
                property.name === 'create' &&
                resolve(object.object) === '*'
            ) {
                return `${object.property.name}.create`;
            }
            return null;
        };

        /**
         * Whether code at `node` runs more than once: inside a function, other than one called
         * immediately or a `defineRecursive` build callback (which run once), or in a class instance field.
         *
         * @param node - node to check
         * @returns true if not at module scope
         */
        const isRepeated = (node: Node): boolean => {
            let child: Node = node;
            for (let { parent } = node; parent; { parent } = parent) {
                if (
                    parent.type === 'PropertyDefinition' &&
                    parent.value === child &&
                    !parent.static
                ) {
                    return true;
                }
                if (functionTypes.has(parent.type)) {
                    const call = parent.parent;
                    const isRunOnce =
                        call?.type === 'CallExpression' &&
                        // Called immediately, e.g. `const a = (() => objectSchema())();`
                        (call.callee === parent ||
                            ((call.arguments as readonly unknown[]).includes(parent) &&
                                factoryOf(call) === 'defineRecursive'));
                    if (!isRunOnce) {
                        return true;
                    }
                }
                child = parent;
            }
            return false;
        };

        return {
            CallExpression: call => {
                const name = factoryOf(call);
                if (name !== null && isRepeated(call)) {
                    context.report({ node: call, messageId: 'topLevel', data: { name } });
                }
            },
        };
    },
};
