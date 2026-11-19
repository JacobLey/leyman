import type { XeneverInvalidSchemaError } from '#internal/lib/errors.js';
import type { BigIntegerKind, IntKind, SimpleType } from '#internal/lib/schema/ir.js';
import type { CompiledSimple } from '#internal/lib/simple/compile-simple.js';
import type { XmlAttributeNode } from '#internal/lib/xml/nodes.js';
import type { Construct, Derivation, Located } from './located.js';
import { builtins, InvalidValueError, whitespaceOrder } from '#internal/lib/simple/builtins.js';
import {
    checkDerivationSet,
    code,
    collapsed,
    invalid,
    isTrue,
    many,
    one,
    optional,
    readConstruct,
    readCount,
    readKeyword,
    required,
    xsdNamespace,
} from './located.js';

/**
 * What building a simple type needs from the rest of the schema.
 */
export interface SimpleContext {
    /**
     * The simple type a QName names.
     *
     * @throws {XeneverInvalidSchemaError} when it names no type, a complex one, or one final for the derivation
     */
    readonly simpleByQName: (
        at: Located,
        attribute: XmlAttributeNode,
        derivation: Derivation,
        text?: string
    ) => SimpleType;
    /**
     * The anonymous simple type an `xs:simpleType` element defines.
     */
    readonly anonymousSimple: (at: Located) => SimpleType;
    /**
     * Compiles a simple type, rethrowing its errors at the construct that defines it.
     */
    readonly compile: (type: SimpleType, at: Located) => CompiledSimple;
    /**
     * Records which construct defines a value of the IR, for errors found when it is compiled.
     */
    readonly record: <T extends object>(value: T, at: Located) => T;
    /**
     * Records the type a simple type restricts, `null` for a list or union, which restricts `xs:anySimpleType`.
     */
    readonly derive: (type: SimpleType, base: SimpleType | null) => void;
}

/**
 * Facets of XSD 1.0 ([XSD 1.1 Part 2 §4.3](https://www.w3.org/TR/xmlschema11-2/#rf-facets)).
 */
export const facetNames = [
    'length',
    'minLength',
    'maxLength',
    'pattern',
    'enumeration',
    'whiteSpace',
    'maxInclusive',
    'maxExclusive',
    'minInclusive',
    'minExclusive',
    'totalDigits',
    'fractionDigits',
];

const minFacets = ['minInclusive', 'minExclusive'];
const maxFacets = ['maxInclusive', 'maxExclusive'];

/**
 * Built-in string types, whose whitespace processing a `whiteSpace` facet may make stricter.
 */
const stringKinds: ReadonlySet<string> = new Set([
    'anyURI',
    'ENTITY',
    'ID',
    'IDREF',
    'language',
    'Name',
    'NCName',
    'NMTOKEN',
    'normalizedString',
    'string',
    'token',
]);

/**
 * A facet as written in one restriction step, its value as the IR writes it.
 */
interface StepFacet {
    readonly value: unknown;
    readonly at: Located;
    readonly attribute: XmlAttributeNode;
}

/**
 * The facets of one restriction step.
 */
interface Step {
    /**
     * Facets that occur at most once, by name.
     */
    readonly single: Map<string, StepFacet>;
    readonly patterns: string[];
    readonly enumeration: unknown[];
}

/**
 * The IR value of a value read from the schema: a `bigint` as its decimal string, as the IR writes integers
 * of `bigint` types. A value the IR can't write in a facet (a list, a QName) stays as written, for the
 * compiled type to report that facet as unsupported on its type.
 *
 * @param value - what the base type read
 * @param text - what it read it from
 * @returns what the IR writes in the facet
 */
const irValue = (value: unknown, text: string): unknown => {
    if (typeof value === 'bigint') {
        return String(value);
    }
    return typeof value === 'number' || typeof value === 'string' ? value : text;
};

/**
 * Throws a {@link XeneverInvalidSchemaError} that a facet loosens the base type, which a restriction can't.
 *
 * @param facet - the facet that loosens it
 * @param what - what of the base type it is outside
 * @returns never: it always throws
 * @throws {XeneverInvalidSchemaError} always
 */
const looser = (facet: StepFacet, what: string): never =>
    invalid(
        facet.at,
        `${code(facet.at.node.localName)} is outside ${what} of the base type`,
        facet.attribute
    );

/**
 * Merges the length facets of a step, which may narrow the base's lengths but not widen them.
 *
 * @param facets - the base's facets, merged into
 * @param step - facets of the step
 */
const mergeLengths = (facets: Map<string, unknown>, step: Step): void => {
    const baseLength = facets.get('length') as number | undefined;
    const baseMin = facets.get('minLength') as number | undefined;
    const baseMax = facets.get('maxLength') as number | undefined;
    const length = step.single.get('length');
    const minimum = step.single.get('minLength');
    const maximum = step.single.get('maxLength');
    if (length) {
        // Unless it repeats a base without `length`, as `minLength="1"` does on a restriction of `xs:IDREFS`
        // ([XSD 1.0 Part 2 §4.3.1.4](https://www.w3.org/TR/xmlschema-2/#length-minLength-maxLength), clause
        // 1.1.2, which XSD 1.1 keeps).
        const isRepeated = (facet: StepFacet | undefined, base: number | undefined): boolean =>
            !facet || (baseLength === undefined && facet.value === base);
        if (!isRepeated(minimum, baseMin) || !isRepeated(maximum, baseMax)) {
            invalid(
                length.at,
                "`length` can not be combined with `minLength` or `maxLength` in one restriction, unless it repeats the base type's"
            );
        }
        const value = length.value as number;
        if (
            (baseLength ?? value) !== value ||
            value < (baseMin ?? value) ||
            value > (baseMax ?? value)
        ) {
            looser(length, 'the lengths');
        }
        facets.delete('minLength');
        facets.delete('maxLength');
        facets.set('length', value);
        return;
    }
    if (minimum) {
        const value = minimum.value as number;
        if (value > (baseLength ?? value) || value < (baseMin ?? value)) {
            looser(minimum, 'the lengths');
        }
    }
    if (maximum) {
        const value = maximum.value as number;
        if (value < (baseLength ?? value) || value > (baseMax ?? value)) {
            looser(maximum, 'the lengths');
        }
    }
    // A fixed length already decides the length; the step only had to agree with it.
    if (baseLength === undefined) {
        for (const facet of [minimum, maximum]) {
            if (facet) {
                facets.set(facet.at.node.localName, facet.value);
            }
        }
    }
};

/**
 * Merges the digit facets of a step, which may lower the base's but not raise them.
 *
 * @param facets - the base's facets, merged into
 * @param step - facets of the step
 */
const mergeDigits = (facets: Map<string, unknown>, step: Step): void => {
    for (const name of ['totalDigits', 'fractionDigits']) {
        const facet = step.single.get(name);
        if (!facet) {
            continue;
        }
        const inherited = (facets.get(name) as number | undefined) ?? Number.POSITIVE_INFINITY;
        if ((facet.value as number) > inherited) {
            looser(facet, 'the digits');
        }
        facets.set(name, facet.value);
    }
};

/**
 * Merges the range facets of a step: a bound replaces the base's on its side. That it narrows the base
 * follows from its value being valid for the base type.
 *
 * @param facets - the base's facets, merged into
 * @param step - facets of the step
 */
const mergeRanges = (facets: Map<string, unknown>, step: Step): void => {
    for (const side of [minFacets, maxFacets]) {
        const given = side.filter(name => step.single.has(name));
        if (given.length === 0) {
            continue;
        }
        for (const name of side) {
            facets.delete(name);
        }
        // Both bounds of one side make an invalid type, which the compiled type reports.
        for (const name of given) {
            facets.set(name, step.single.get(name)!.value);
        }
    }
};

/**
 * Merges the `whiteSpace` facet of a step, which may only make whitespace processing stricter. Only string
 * types take it in the IR; every other atomic type and list always collapses, so for them `collapse`
 * changes nothing and is left out.
 *
 * @param facets - the base's facets, merged into
 * @param base - the base type
 * @param facet - the step's `whiteSpace`, if any
 */
const mergeWhitespace = (
    facets: Map<string, unknown>,
    base: SimpleType,
    facet: StepFacet | undefined
): void => {
    if (!facet) {
        return;
    }
    const value = facet.value as keyof typeof whitespaceOrder;
    if (base.kind === 'union') {
        // XSD gives a union no whiteSpace facet; the compiled type reports it.
        facets.set('whiteSpace', value);
        return;
    }
    const isString = stringKinds.has(base.kind);
    const current = isString
        ? ((facets.get('whiteSpace') as keyof typeof whitespaceOrder | undefined) ??
          builtins[base.kind as keyof typeof builtins].whitespace)
        : 'collapse';
    if (whitespaceOrder[value] < whitespaceOrder[current]) {
        invalid(
            facet.at,
            `\`whiteSpace\` can not loosen the base type's ${code(current)}`,
            facet.attribute
        );
    }
    if (isString) {
        facets.set('whiteSpace', value);
    }
};

/**
 * Built-in integer types, which `xs:integer` derives from `xs:decimal` with `fractionDigits` fixed to 0
 * ([XSD 1.1 Part 2 §3.4.13](https://www.w3.org/TR/xmlschema11-2/#integer)).
 */
const integerKinds: ReadonlySet<string> = new Set<BigIntegerKind | IntKind>([
    'integer',
    'long',
    'int',
    'short',
    'byte',
    'nonNegativeInteger',
    'positiveInteger',
    'nonPositiveInteger',
    'negativeInteger',
    'unsignedLong',
    'unsignedInt',
    'unsignedShort',
    'unsignedByte',
]);

/**
 * Facets a built-in type fixes, which no restriction of it may change.
 */
const integerFixed: ReadonlyMap<string, unknown> = new Map([['fractionDigits', 0]]);

/**
 * Builds simple types: restrictions merge their facets into their base type's, as the IR has no derivation.
 */
export class SimpleTypeBuilder {
    readonly #context: SimpleContext;
    /**
     * Facets each type fixed (`fixed="true"`), with their values, which a restriction may not change.
     */
    readonly #fixed = new WeakMap<SimpleType, ReadonlyMap<string, unknown>>();

    /**
     * @param context - what building needs from the rest of the schema
     */
    public constructor(context: SimpleContext) {
        this.#context = context;
    }

    /**
     * Builds the type an `xs:simpleType` element defines.
     *
     * @param at - the `xs:simpleType` element
     * @param isGlobal - whether it is a named, global type
     * @returns what it defines
     */
    public simpleType(at: Located, isGlobal: boolean): SimpleType {
        const construct = readConstruct(at, {
            attributes: isGlobal ? ['name', 'final', 'id'] : ['id'],
            content: [one('restriction', 'list', 'union')],
        });
        checkDerivationSet(at, construct.attributes.get('final'), [
            'list',
            'union',
            'restriction',
            'extension',
        ]);
        const [derivation] = construct.children as [Located];
        switch (derivation.node.localName) {
            case 'restriction': {
                return this.#restriction(derivation);
            }
            case 'list': {
                return this.#list(derivation);
            }
            default: {
                return this.#union(derivation);
            }
        }
    }

    /**
     * Restricts a type by the facets of one restriction step
     * ([XSD 1.1 Part 2 §4.1.6](https://www.w3.org/TR/xmlschema11-2/#dt-restriction)): patterns of the step
     * are alternatives (one `|`-joined pattern) and must all match along with the base's; enumerations replace
     * the base's, and must each be valid for it; other facets replace the base's but may only narrow it, a
     * range bound's value being valid for the base.
     *
     * @param at - the restriction
     * @param base - the type it restricts
     * @param facetNodes - the facet elements of the step
     * @returns the restricted type: a copy even with no facets, so each named type is its own object
     * @throws {XeneverInvalidSchemaError} when a facet is not valid, loosens the base or changes a fixed facet
     */
    public restrict(at: Located, base: SimpleType, facetNodes: readonly Located[]): SimpleType {
        const step = this.#readStep(at, base, facetNodes);
        const fixedByBase =
            this.#fixed.get(base) ?? (integerKinds.has(base.kind) ? integerFixed : undefined);
        const fixed = new Map(fixedByBase);
        for (const [name, facet] of step.single) {
            if (fixedByBase?.has(name) === true && fixedByBase.get(name) !== facet.value) {
                invalid(facet.at, `${code(name)} is fixed by the base type`, facet.attribute);
            }
            const fixedAttribute = facet.at.node.attributes.find(
                attribute => attribute.namespace === null && attribute.localName === 'fixed'
            );
            if (isTrue(facet.at, fixedAttribute)) {
                fixed.set(name, facet.value);
            }
        }

        const facets = new Map(Object.entries(base.facets ?? {}));
        mergeLengths(facets, step);
        mergeDigits(facets, step);
        mergeRanges(facets, step);
        mergeWhitespace(facets, base, step.single.get('whiteSpace'));
        if (step.patterns.length > 0) {
            const joined = step.patterns.join('|');
            const inherited = facets.get('pattern') as string | readonly string[] | undefined;
            facets.set(
                'pattern',
                inherited === undefined ? joined : [...[inherited].flat(), joined]
            );
        }
        if (step.enumeration.length > 0) {
            facets.set('enumeration', step.enumeration);
        }

        // Merging never removes the last facet, so no facets means the base had none.
        const restricted = this.#context.record(
            facets.size === 0 ? { ...base } : { ...base, facets: Object.fromEntries(facets) },
            at
        );
        if (fixed.size > 0) {
            this.#fixed.set(restricted, fixed);
        }
        this.#context.derive(restricted, base);
        return restricted;
    }

    /**
     * Reads the facets of a restriction step.
     *
     * @param at - the restriction
     * @param base - the type it restricts, which reads the values of range facets and enumerations
     * @param facetNodes - the facet elements of the step
     * @returns the facets
     * @throws {XeneverInvalidSchemaError} when a facet is not valid, or occurs twice
     */
    #readStep(at: Located, base: SimpleType, facetNodes: readonly Located[]): Step {
        const step: Step = { single: new Map(), patterns: [], enumeration: [] };
        let compiledBase: CompiledSimple | null = null;
        const readValue = (facet: Located, attribute: XmlAttributeNode): unknown => {
            compiledBase ??= this.#context.compile(base, at);
            try {
                return irValue(
                    compiledBase.parse(attribute.value, facet.node.inScopeNamespaces),
                    attribute.value
                );
            } catch (error) {
                // Unreachable: reading a value throws only invalid values.
                /* c8 ignore next 3 */
                if (!(error instanceof InvalidValueError)) {
                    throw error;
                }
                return invalid(
                    facet,
                    `${code(facet.node.localName)} is not valid for the base type: ${error.message}`,
                    attribute
                );
            }
        };
        for (const facet of facetNodes) {
            const name = facet.node.localName;
            const isRepeatable = name === 'pattern' || name === 'enumeration';
            const construct = readConstruct(facet, {
                attributes: isRepeatable ? ['value', 'id'] : ['value', 'fixed', 'id'],
                content: [],
            });
            const attribute = required(facet, construct, 'value');
            if (name === 'pattern') {
                step.patterns.push(attribute.value);
            } else if (name === 'enumeration') {
                const value = readValue(facet, attribute);
                if (!step.enumeration.includes(value)) {
                    step.enumeration.push(value);
                }
            } else if (step.single.has(name)) {
                invalid(facet, `\`xs:${name}\` may occur only once in a restriction`);
            } else {
                let value: unknown;
                if (name === 'whiteSpace') {
                    value = readKeyword(facet, attribute, ['preserve', 'replace', 'collapse']);
                } else if (minFacets.includes(name) || maxFacets.includes(name)) {
                    value = readValue(facet, attribute);
                } else {
                    value = readCount(facet, attribute);
                }
                step.single.set(name, { attribute, value, at: facet });
            }
        }
        return step;
    }

    /**
     * Builds a restriction of a simple type, from its `base` or the anonymous type it holds.
     *
     * @param at - the `xs:restriction` element
     * @returns the restricted type
     */
    #restriction(at: Located): SimpleType {
        const construct = readConstruct(at, {
            attributes: ['base', 'id'],
            content: [optional('simpleType'), many(...facetNames)],
        });
        const [first, ...rest] = construct.children;
        const inline = first?.node.localName === 'simpleType' ? first : null;
        const base = this.#base(at, construct, inline);
        return this.restrict(at, base, inline ? rest : construct.children);
    }

    /**
     * Reads the base type of a restriction: its `base` attribute or the anonymous type it holds, one of them.
     *
     * @param at - the `xs:restriction` element
     * @param construct - it, read
     * @param inline - the anonymous type, if any
     * @returns the base type
     */
    #base(at: Located, construct: Construct, inline: Located | null): SimpleType {
        const baseAttribute = construct.attributes.get('base');
        if ((baseAttribute === undefined) === (inline === null)) {
            invalid(at, 'A restriction has either a `base` or an `xs:simpleType`, one of them');
        }
        if (inline) {
            return this.#context.anonymousSimple(inline);
        }
        const text = collapsed(baseAttribute!);
        const colon = text.indexOf(':');
        if (
            text.slice(colon + 1) === 'anySimpleType' &&
            at.node.inScopeNamespaces.get(colon === -1 ? '' : text.slice(0, colon)) === xsdNamespace
        ) {
            // Its restrictions are the primitive types, which only XML Schema itself defines.
            invalid(at, 'Only a built-in type may restrict `xs:anySimpleType`', baseAttribute);
        }
        return this.#context.simpleByQName(at, baseAttribute!, 'restriction');
    }

    /**
     * Builds a list type.
     *
     * @param at - the `xs:list` element
     * @returns a list of its item type
     */
    #list(at: Located): SimpleType {
        const construct = readConstruct(at, {
            attributes: ['itemType', 'id'],
            content: [optional('simpleType')],
        });
        const itemType = construct.attributes.get('itemType');
        const [inline] = construct.children;
        if ((itemType === undefined) === (inline === undefined)) {
            invalid(at, 'A list has either an `itemType` or an `xs:simpleType`, one of them');
        }
        const item = inline
            ? this.#context.anonymousSimple(inline)
            : this.#context.simpleByQName(at, itemType!, 'list');
        // The item type may itself be a list, which the compiled type reports.
        const list = this.#context.record({ kind: 'list', item } as SimpleType, at);
        this.#context.derive(list, null);
        return list;
    }

    /**
     * Builds a union type.
     *
     * @param at - the `xs:union` element
     * @returns a union of its member types, named ones first
     */
    #union(at: Located): SimpleType {
        const construct = readConstruct(at, {
            attributes: ['memberTypes', 'id'],
            content: [many('simpleType')],
        });
        const memberTypes = construct.attributes.get('memberTypes');
        const named = memberTypes ? collapsed(memberTypes).split(' ').filter(Boolean) : [];
        const members = [
            ...named.map(text => this.#context.simpleByQName(at, memberTypes!, 'union', text)),
            ...construct.children.map(child => this.#context.anonymousSimple(child)),
        ];
        if (members.length === 0) {
            invalid(at, 'A union needs at least one member type');
        }
        const union = this.#context.record<SimpleType>({ kind: 'union', members }, at);
        this.#context.derive(union, null);
        return union;
    }
}
