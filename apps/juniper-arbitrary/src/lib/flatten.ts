import type { SchemaIndex } from './refs.js';
import { canonicalJson } from './json.js';

export type SchemaNode = boolean | SchemaObject;

export type TypeName = 'array' | 'boolean' | 'integer' | 'null' | 'number' | 'object' | 'string';

/**
 * The JSON Schema keywords read here. Anything else is an annotation, or left to the validator.
 */
export interface SchemaObject {
    readonly $anchor?: string;
    readonly $defs?: Readonly<Record<string, SchemaNode>>;
    readonly $dynamicAnchor?: string;
    readonly $dynamicRef?: string;
    readonly $id?: string;
    readonly $ref?: string;
    readonly additionalProperties?: SchemaNode;
    readonly allOf?: readonly SchemaNode[];
    readonly anyOf?: readonly SchemaNode[];
    readonly const?: unknown;
    readonly contains?: SchemaNode;
    readonly contentEncoding?: string;
    readonly dependentRequired?: Readonly<Record<string, readonly string[]>>;
    readonly dependentSchemas?: Readonly<Record<string, SchemaNode>>;
    readonly else?: SchemaNode;
    readonly enum?: readonly unknown[];
    readonly exclusiveMaximum?: number;
    readonly exclusiveMinimum?: number;
    readonly format?: string;
    readonly if?: SchemaNode;
    readonly items?: SchemaNode;
    readonly maxContains?: number;
    readonly maximum?: number;
    readonly maxItems?: number;
    readonly maxLength?: number;
    readonly maxProperties?: number;
    readonly minContains?: number;
    readonly minimum?: number;
    readonly minItems?: number;
    readonly minLength?: number;
    readonly minProperties?: number;
    readonly multipleOf?: number;
    readonly not?: SchemaNode;
    readonly oneOf?: readonly SchemaNode[];
    readonly pattern?: string;
    readonly patternProperties?: Readonly<Record<string, SchemaNode>>;
    readonly prefixItems?: readonly SchemaNode[];
    readonly properties?: Readonly<Record<string, SchemaNode>>;
    readonly propertyNames?: SchemaNode;
    readonly required?: readonly string[];
    readonly then?: SchemaNode;
    readonly type?: TypeName | readonly TypeName[];
    readonly unevaluatedItems?: SchemaNode;
    readonly unevaluatedProperties?: SchemaNode;
    readonly uniqueItems?: boolean;
}

/**
 * One way of satisfying a schema: its composition (`allOf`, `anyOf`, `$ref`, ...) resolved away,
 * leaving the constraints a generator can aim at directly.
 */
export interface Branch {
    readonly additionalProperties: readonly SchemaNode[];
    readonly contains: readonly SchemaNode[];
    readonly enum: readonly unknown[] | null;
    readonly exclusiveMaximum: number;
    readonly exclusiveMinimum: number;
    readonly formats: readonly string[];
    readonly items: readonly SchemaNode[];
    readonly maxContains: number;
    readonly maximum: number;
    readonly maxItems: number;
    readonly maxLength: number;
    readonly maxProperties: number;
    /**
     * Null if unset, as the default of 1 must not outweigh a schema that set 0.
     */
    readonly minContains: number | null;
    readonly minimum: number;
    readonly minItems: number;
    readonly minLength: number;
    readonly minProperties: number;
    readonly multipleOf: readonly number[];
    readonly patternProperties: ReadonlyMap<string, readonly SchemaNode[]>;
    readonly patterns: readonly string[];
    readonly prefixItems: readonly (readonly SchemaNode[])[];
    readonly properties: ReadonlyMap<string, readonly SchemaNode[]>;
    readonly propertyNames: readonly SchemaNode[];
    readonly required: ReadonlySet<string>;
    /**
     * Part of the schema isn't captured by this branch, so its values need validating.
     */
    readonly residual: boolean;
    readonly types: ReadonlySet<TypeName>;
    readonly uniqueItems: boolean;
}

const allTypes: readonly TypeName[] = [
    'array',
    'boolean',
    'integer',
    'null',
    'number',
    'object',
    'string',
];

const emptyBranch: Branch = {
    additionalProperties: [],
    contains: [],
    enum: null,
    exclusiveMaximum: Number.POSITIVE_INFINITY,
    exclusiveMinimum: Number.NEGATIVE_INFINITY,
    formats: [],
    items: [],
    maxContains: Number.POSITIVE_INFINITY,
    maximum: Number.POSITIVE_INFINITY,
    maxItems: Number.POSITIVE_INFINITY,
    maxLength: Number.POSITIVE_INFINITY,
    maxProperties: Number.POSITIVE_INFINITY,
    minContains: null,
    minimum: Number.NEGATIVE_INFINITY,
    minItems: 0,
    minLength: 0,
    minProperties: 0,
    multipleOf: [],
    patternProperties: new Map(),
    patterns: [],
    prefixItems: [],
    properties: new Map(),
    propertyNames: [],
    required: new Set(),
    residual: false,
    types: new Set(allTypes),
    uniqueItems: false,
};

/**
 * Composition multiplies branches, so a schema with many conditionals could produce thousands.
 * Beyond this some are dropped: every value generated is still valid, but some shapes never appear.
 */
const maxBranches = 64;

const intersectTypes = (
    left: ReadonlySet<TypeName>,
    right: ReadonlySet<TypeName>
): ReadonlySet<TypeName> => {
    const types = left.intersection(right);
    // Every integer is a number
    if (
        (left.has('number') && right.has('integer')) ||
        (left.has('integer') && right.has('number'))
    ) {
        types.add('integer');
    }
    return types;
};

const intersectEnums = (
    left: readonly unknown[] | null,
    right: readonly unknown[] | null
): readonly unknown[] | null => {
    if (left === null || right === null) {
        return left ?? right;
    }
    const keys = new Set(right.map(value => canonicalJson(value)));
    return left.filter(value => keys.has(canonicalJson(value)));
};

const mergeNodeMaps = (
    left: ReadonlyMap<string, readonly SchemaNode[]>,
    right: ReadonlyMap<string, readonly SchemaNode[]>
): ReadonlyMap<string, readonly SchemaNode[]> => {
    const merged = new Map(left);
    for (const [key, nodes] of right) {
        merged.set(key, [...(merged.get(key) ?? []), ...nodes]);
    }
    return merged;
};

/**
 * `additionalProperties` only sees the `properties` and `patternProperties` next to it, so a key
 * another schema declares is held to it unless that schema covers the key too
 * (https://json-schema.org/draft/2020-12/json-schema-core#section-10.3.2.3). `false` there
 * forbids the key outright.
 *
 * @param own - branch whose `properties` are kept
 * @param other - branch merged with it
 * @returns `own.properties`, each key `other` doesn't cover also held to its `additionalProperties`
 */
const holdToAdditional = (
    own: Branch,
    other: Branch
): ReadonlyMap<string, readonly SchemaNode[]> => {
    if (other.additionalProperties.length === 0) {
        return own.properties;
    }
    const patterns = other.patternProperties
        .keys()
        .map(pattern => new RegExp(pattern, 'u'))
        .toArray();
    return new Map(
        own.properties
            .entries()
            .map(([key, nodes]) =>
                other.properties.has(key) || patterns.some(pattern => pattern.test(key))
                    ? [key, nodes]
                    : [key, [...nodes, ...other.additionalProperties]]
            )
    );
};

/**
 * `additionalProperties` and `items` only see the `patternProperties` and `prefixItems` next to
 * them, so once merged with another schema's their meaning is no longer captured exactly.
 * Declared `properties` are captured by {@link holdToAdditional}.
 *
 * @param left - branch to merge
 * @param right - branch to merge
 * @returns whether the merge loses part of the meaning of either
 */
const doesMergeLoseScope = (left: Branch, right: Branch): boolean =>
    (left.additionalProperties.length > 0 && right.patternProperties.size > 0) ||
    (right.additionalProperties.length > 0 && left.patternProperties.size > 0) ||
    (left.items.length > 0 && right.prefixItems.length > 0) ||
    (right.items.length > 0 && left.prefixItems.length > 0);

const mergeBranches = (left: Branch, right: Branch): Branch => ({
    additionalProperties: [...left.additionalProperties, ...right.additionalProperties],
    contains: [...left.contains, ...right.contains],
    enum: intersectEnums(left.enum, right.enum),
    exclusiveMaximum: Math.min(left.exclusiveMaximum, right.exclusiveMaximum),
    exclusiveMinimum: Math.max(left.exclusiveMinimum, right.exclusiveMinimum),
    formats: [...left.formats, ...right.formats],
    items: [...left.items, ...right.items],
    maxContains: Math.min(left.maxContains, right.maxContains),
    maximum: Math.min(left.maximum, right.maximum),
    maxItems: Math.min(left.maxItems, right.maxItems),
    maxLength: Math.min(left.maxLength, right.maxLength),
    maxProperties: Math.min(left.maxProperties, right.maxProperties),
    minContains:
        left.minContains === null || right.minContains === null
            ? (left.minContains ?? right.minContains)
            : Math.max(left.minContains, right.minContains),
    minimum: Math.max(left.minimum, right.minimum),
    minItems: Math.max(left.minItems, right.minItems),
    minLength: Math.max(left.minLength, right.minLength),
    minProperties: Math.max(left.minProperties, right.minProperties),
    multipleOf: [...left.multipleOf, ...right.multipleOf],
    patternProperties: mergeNodeMaps(left.patternProperties, right.patternProperties),
    patterns: [...left.patterns, ...right.patterns],
    prefixItems: [...left.prefixItems, ...right.prefixItems],
    properties: mergeNodeMaps(holdToAdditional(left, right), holdToAdditional(right, left)),
    propertyNames: [...left.propertyNames, ...right.propertyNames],
    required: new Set([...left.required, ...right.required]),
    residual: left.residual || right.residual || doesMergeLoseScope(left, right),
    types: intersectTypes(left.types, right.types),
    uniqueItems: left.uniqueItems || right.uniqueItems,
});

const toNodeMap = (
    record: Readonly<Record<string, SchemaNode>> | undefined
): ReadonlyMap<string, readonly SchemaNode[]> =>
    new Map(Object.entries(record ?? {}).map(([key, node]) => [key, [node]]));

const toList = <T>(value: T | undefined): readonly T[] => (value === undefined ? [] : [value]);

const ownEnum = (node: SchemaObject): readonly unknown[] | null =>
    'const' in node ? [node.const] : (node.enum ?? null);

const ownTypes = ({ type }: SchemaObject): ReadonlySet<TypeName> => {
    if (type === undefined) {
        return emptyBranch.types;
    }
    return new Set(typeof type === 'string' ? [type] : type);
};

const ownBranch = (node: SchemaObject): Branch => ({
    additionalProperties: toList(node.additionalProperties),
    contains: toList(node.contains),
    enum: ownEnum(node),
    exclusiveMaximum: node.exclusiveMaximum ?? emptyBranch.exclusiveMaximum,
    exclusiveMinimum: node.exclusiveMinimum ?? emptyBranch.exclusiveMinimum,
    formats: toList(node.format ?? (node.contentEncoding === 'base64' ? 'byte' : undefined)),
    items: toList(node.items),
    maxContains: node.maxContains ?? emptyBranch.maxContains,
    maximum: node.maximum ?? emptyBranch.maximum,
    maxItems: node.maxItems ?? emptyBranch.maxItems,
    maxLength: node.maxLength ?? emptyBranch.maxLength,
    maxProperties: node.maxProperties ?? emptyBranch.maxProperties,
    minContains: node.minContains ?? emptyBranch.minContains,
    minimum: node.minimum ?? emptyBranch.minimum,
    minItems: node.minItems ?? emptyBranch.minItems,
    minLength: node.minLength ?? emptyBranch.minLength,
    minProperties: node.minProperties ?? emptyBranch.minProperties,
    multipleOf: toList(node.multipleOf),
    patternProperties: toNodeMap(node.patternProperties),
    patterns: toList(node.pattern),
    prefixItems: node.prefixItems ? [node.prefixItems] : [],
    properties: toNodeMap(node.properties),
    propertyNames: toList(node.propertyNames),
    required: new Set(node.required),
    residual:
        // Not followed: what it refers to depends on the path taken to it, which the validator tracks
        node.$dynamicRef !== undefined ||
        node.not !== undefined ||
        node.oneOf !== undefined ||
        node.if !== undefined ||
        node.unevaluatedItems !== undefined ||
        node.unevaluatedProperties !== undefined,
    types: ownTypes(node),
    uniqueItems: node.uniqueItems ?? false,
});

const cross = (left: readonly Branch[], right: readonly Branch[]): readonly Branch[] =>
    left.flatMap(a => right.map(b => mergeBranches(a, b))).slice(0, maxBranches);

/**
 * Resolve a schema's composition into the branches a value could satisfy.
 *
 * Only what can be aimed at is captured, and {@link Branch.residual} marks what isn't.
 * A branch may also accept values its schema doesn't, such as `if` without its negation: the
 * validator has the last word, so all this decides is how often generation hits on a valid value.
 *
 * A `$ref` is looked up in the root schema. One that isn't found there is one the validator, which
 * compiled the schema, found some other way, so anything goes here and the validator decides.
 *
 * @param index - the root schema's resources, which `$ref`s are looked up in
 * @param node - schema to resolve
 * @param path - path of the schema, for errors
 * @param [inheritedBase] - base URI around the schema, for one not in the root
 * @param [activeRefs] - URIs of the `$ref`s being resolved. Meeting one again before descending into a value means it adds nothing
 * @returns branches, empty if nothing can match
 */
export const flatten = (
    index: SchemaIndex,
    node: SchemaNode,
    path: string,
    inheritedBase: string = index.rootBase,
    activeRefs: ReadonlySet<string> = new Set()
): readonly Branch[] => {
    if (typeof node === 'boolean') {
        return node ? [emptyBranch] : [];
    }
    // `not: {}` and `not: true` are how "matches nothing" is spelled (`neverSchema()`)
    if (node.not === true || (typeof node.not === 'object' && Object.keys(node.not).length === 0)) {
        return [];
    }

    const base = index.baseOf(node, inheritedBase);
    const flattenAt = (child: SchemaNode, childPath: string): readonly Branch[] =>
        flatten(index, child, childPath, base, activeRefs);
    const flattenAll = (nodes: readonly SchemaNode[], keyword: string): readonly Branch[] =>
        nodes.flatMap((child, position) => flattenAt(child, `${path}/${keyword}/${position}`));
    const steps: (readonly Branch[])[] = [];

    if (node.$ref !== undefined) {
        const resolved = index.resolve(node.$ref, base);
        if (!resolved) {
            steps.push([emptyBranch]);
        } else if (activeRefs.has(resolved.uri)) {
            steps.push([]);
        } else {
            steps.push(
                flatten(index, resolved.node, path, base, new Set([...activeRefs, resolved.uri]))
            );
        }
    }
    if (node.allOf) {
        for (const [position, child] of node.allOf.entries()) {
            steps.push(flattenAt(child, `${path}/allOf/${position}`));
        }
    }
    if (node.anyOf) {
        steps.push(flattenAll(node.anyOf, 'anyOf'));
    }
    if (node.oneOf) {
        steps.push(flattenAll(node.oneOf, 'oneOf'));
    }
    if (node.if !== undefined) {
        steps.push([
            ...cross(
                flattenAt(node.if, `${path}/if`),
                flattenAt(node.then ?? true, `${path}/then`)
            ),
            ...flattenAt(node.else ?? true, `${path}/else`),
        ]);
    }
    // Either the key is absent, or it is present and brings its dependencies with it
    if (node.dependentRequired !== undefined) {
        for (const [key, dependencies] of Object.entries(node.dependentRequired)) {
            steps.push([
                { ...emptyBranch, properties: new Map([[key, [false]]]) },
                { ...emptyBranch, required: new Set([key, ...dependencies]) },
            ]);
        }
    }
    if (node.dependentSchemas !== undefined) {
        for (const [key, dependent] of Object.entries(node.dependentSchemas)) {
            steps.push([
                { ...emptyBranch, properties: new Map([[key, [false]]]) },
                ...cross(
                    [{ ...emptyBranch, required: new Set([key]) }],
                    flattenAt(dependent, `${path}/dependentSchemas/${key}`)
                ),
            ]);
        }
    }

    let branches: readonly Branch[] = [ownBranch(node)];
    for (const step of steps) {
        branches = cross(branches, step);
    }
    return branches;
};
