import type {
    Any,
    AnyAttribute,
    Attribute,
    ComplexType,
    Element,
    Lazy,
    ModelGroup,
    Particle,
    SimpleType,
    Type,
} from '#internal/lib/schema/ir.js';
import type { StandardSchemaV1 } from '#internal/lib/standard-schema.js';
import type { XmlAttributeNode, XmlElementNode } from '#internal/lib/xml/nodes.js';
import type { Construct, Grammar, Located, ReadOccurs, SchemaDocument } from './located.js';
import type { Wildcard } from './wildcards.js';
import {
    reasonOf,
    XeneverInvalidSchemaError,
    XeneverSchemaError,
    XeneverUnsupportedError,
} from '#internal/lib/errors.js';
import { element as buildElement, lazy } from '#internal/lib/schema/builders.js';
import { ShapeConflictError } from '#internal/lib/schema/check.js';
import { compileElement } from '#internal/lib/schema/compile.js';
import { compileSimple } from '#internal/lib/simple/compile-simple.js';
import { xmlNamespace } from '#internal/lib/xml/nodes.js';
import {
    atomicKinds,
    bigIntegerKinds,
    createAnyType,
    createXmlAttributes,
    listKinds,
    xmlSpecialAttributes,
    xsd11Types,
} from './builtins.js';
import {
    checkDerivationSet,
    clark,
    invalid,
    isTrue,
    locationIn,
    many,
    one,
    optional,
    readConstruct,
    readKeyword,
    readNcName,
    readOccurs,
    required,
    resolveQName,
    unsupported,
    written,
    xsdNamespace,
    xsiNamespace,
} from './located.js';
import { facetNames, SimpleTypeBuilder } from './simple.js';
import { fromIr, intersectAll, isAllowed, toIr, unite } from './wildcards.js';

/**
 * Global components of the schemas loaded, by name in Clark notation, one table per symbol space
 * ([XSD 1.1 Part 1 §3.17.3](https://www.w3.org/TR/xmlschema11-1/#sch_details)).
 */
export interface SymbolTables {
    readonly elements: Map<string, Located>;
    readonly attributes: Map<string, Located>;
    readonly types: Map<string, Located>;
    readonly groups: Map<string, Located>;
    readonly attributeGroups: Map<string, Located>;
}

/**
 * A global element declaration loaded from an XSD, which `parse` takes as the root. Like the `x.element`
 * builder's, it implements Standard Schema.
 */
export type XsdElement = Element & StandardSchemaV1<string, unknown>;

/**
 * A named type loaded from an XSD.
 */
export interface XsdNamedType {
    /**
     * Local name.
     */
    readonly name: string;
    /**
     * Target namespace of its schema, absent when it has none.
     */
    readonly namespace?: string;
    /**
     * The type: the same object wherever an element or attribute uses it.
     */
    readonly type: Type;
}

/**
 * What an XSD and the files it includes and imports declare, as the schema IR.
 */
export interface XsdSchemaSet {
    /**
     * Global element declarations, in document order: the file loaded first, then the files it includes
     * and imports, depth first, in the order they appear.
     */
    readonly elements: readonly XsdElement[];
    /**
     * Named simple and complex types, in the same order.
     */
    readonly types: readonly XsdNamedType[];
}

/**
 * How building treats the schema.
 */
export interface BuildOptions {
    /**
     * Whether big integer types are `bigint`.
     */
    readonly bigint: boolean;
    /**
     * `xs:complexType` elements whose children are ordered, with the name the `ordered` option gave.
     */
    readonly ordered: ReadonlyMap<XmlElementNode, string>;
}

/**
 * Attribute declarations of a type or attribute group, with the names it prohibits and its wildcard.
 */
interface AttributeUses {
    readonly attributes: readonly Attribute[];
    readonly prohibited: ReadonlySet<string>;
    readonly wildcard: Wildcard | null;
}

/**
 * Attribute declarations and wildcard a type inherits from its base type.
 */
interface Inherited {
    readonly attributes: readonly Attribute[];
    readonly wildcard: Wildcard | null;
}

/**
 * Properties of a complex type besides its `kind`, as they are filled in.
 */
type ComplexFields = Omit<ComplexType, 'kind'>;

/**
 * A copy of a type whose properties can be set.
 *
 * @template T - the type
 */
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * What may follow the optional particle of a complex type or derivation.
 */
const attributeSlots = [many('attribute', 'attributeGroup'), optional('anyAttribute')];

/**
 * Grammars of the XSD elements the builder reads ([XSD 1.1 Part 1 §3](https://www.w3.org/TR/xmlschema11-1/#components)).
 */
const grammars = {
    globalElement: {
        attributes: [
            'name',
            'type',
            'default',
            'fixed',
            'nillable',
            'abstract',
            'block',
            'final',
            'id',
        ],
        content: [optional('simpleType', 'complexType')],
    },
    localElement: {
        attributes: [
            'name',
            'ref',
            'type',
            'minOccurs',
            'maxOccurs',
            'default',
            'fixed',
            'nillable',
            'block',
            'form',
            'id',
        ],
        content: [optional('simpleType', 'complexType')],
    },
    globalAttribute: {
        attributes: ['name', 'type', 'default', 'fixed', 'id'],
        content: [optional('simpleType')],
    },
    localAttribute: {
        attributes: ['name', 'ref', 'type', 'use', 'default', 'fixed', 'form', 'id'],
        content: [optional('simpleType')],
    },
    globalComplexType: {
        attributes: ['name', 'mixed', 'abstract', 'block', 'final', 'id'],
        content: [
            optional('simpleContent', 'complexContent', 'group', 'all', 'choice', 'sequence'),
            ...attributeSlots,
        ],
    },
    localComplexType: {
        attributes: ['mixed', 'id'],
        content: [
            optional('simpleContent', 'complexContent', 'group', 'all', 'choice', 'sequence'),
            ...attributeSlots,
        ],
    },
    simpleContent: { attributes: ['id'], content: [one('restriction', 'extension')] },
    complexContent: { attributes: ['mixed', 'id'], content: [one('restriction', 'extension')] },
    complexDerivation: {
        attributes: ['base', 'id'],
        content: [optional('group', 'all', 'choice', 'sequence'), ...attributeSlots],
    },
    simpleExtension: { attributes: ['base', 'id'], content: attributeSlots },
    simpleRestriction: {
        attributes: ['base', 'id'],
        content: [optional('simpleType'), many(...facetNames), ...attributeSlots],
    },
    groupDefinition: { attributes: ['name', 'id'], content: [one('all', 'choice', 'sequence')] },
    groupReference: { attributes: ['ref', 'minOccurs', 'maxOccurs', 'id'], content: [] },
    attributeGroupDefinition: { attributes: ['name', 'id'], content: attributeSlots },
    attributeGroupReference: { attributes: ['ref', 'id'], content: [] },
    any: {
        attributes: ['namespace', 'processContents', 'minOccurs', 'maxOccurs', 'id'],
        content: [],
    },
    anyAttribute: { attributes: ['namespace', 'processContents', 'id'], content: [] },
} as const satisfies Record<string, Grammar>;

/**
 * Element names of the particle a complex type or derivation may start with.
 */
const particleNames: ReadonlySet<string> = new Set(['group', 'all', 'choice', 'sequence']);

/**
 * Derivations `block` and `final` may list on elements and complex types.
 */
const elementBlock = ['extension', 'restriction', 'substitution'];
const typeDerivations = ['extension', 'restriction'];

/**
 * Whether a model group is empty as a type's content: no particles, unless it is a choice that must occur
 * ([XSD 1.1 Part 1 §3.4.2.3.3](https://www.w3.org/TR/xmlschema11-1/#dcl.ctd.ctcc.common), clause 4.1).
 *
 * @param group - the group, or `null` for none
 * @returns whether it is empty
 */
const isEmptyParticle = (group: ModelGroup | null): group is null =>
    group === null ||
    (group.particles.length === 0 && (group.kind !== 'choice' || group.minOccurs === 0));

/**
 * Name of an attribute declaration in Clark notation.
 *
 * @param attribute - the declaration
 * @returns its name
 */
const attributeName = (attribute: Attribute): string =>
    clark(attribute.namespace ?? null, attribute.name);

/**
 * Reads `default` and `fixed`, one of which a declaration may have.
 *
 * @param at - the declaration
 * @param construct - it, read
 * @returns the IR properties
 */
const valueConstraint = (
    at: Located,
    construct: Construct
): { readonly default?: string; readonly fixed?: string } => {
    const defaultValue = construct.attributes.get('default');
    const fixedValue = construct.attributes.get('fixed');
    if (defaultValue && fixedValue) {
        invalid(at, 'A declaration has either `default` or `fixed`, not both', fixedValue);
    }
    return {
        ...(defaultValue && { default: defaultValue.value }),
        ...(fixedValue && { fixed: fixedValue.value }),
    };
};

/**
 * Checks an attribute's name: `xmlns` is a namespace declaration, never an attribute
 * ([XSD 1.1 Part 1 §3.2.6.3](https://www.w3.org/TR/xmlschema11-1/#no-xmlns)).
 *
 * @param at - the declaration
 * @param nameAttribute - its `name`
 * @returns the local name
 */
const checkAttributeName = (at: Located, nameAttribute: XmlAttributeNode): string => {
    const name = readNcName(at, nameAttribute);
    if (name === 'xmlns') {
        invalid(at, 'An attribute can not be named `xmlns`', nameAttribute);
    }
    return name;
};

/**
 * Reads a wildcard's namespace constraint. Its `processContents` is checked, and otherwise ignored: xenever
 * keeps what a wildcard matches as nodes, unvalidated.
 *
 * @param at - the `xs:any` or `xs:anyAttribute` element
 * @param construct - it, read
 * @returns the constraint
 */
const readWildcard = (at: Located, construct: Construct): Wildcard => {
    readKeyword(at, construct.attributes.get('processContents'), ['skip', 'lax', 'strict']);
    const attribute = construct.attributes.get('namespace');
    const value = attribute ? attribute.value.trim() : '##any';
    const { targetNamespace } = at.doc;
    if (value === '##any') {
        return { mode: 'any' };
    }
    if (value === '##other') {
        // XSD 1.0's `##other` is neither the target namespace nor no namespace.
        return { mode: 'not', namespaces: new Set([targetNamespace, null]) };
    }
    const namespaces = new Set<string | null>();
    const tokens = value.split(/[\t\n\r ]+/v).filter(Boolean);
    for (const token of tokens) {
        if (token === '##targetNamespace') {
            namespaces.add(targetNamespace);
        } else if (token === '##local') {
            namespaces.add(null);
        } else if (token.startsWith('##')) {
            invalid(at, `\`${token}\` can not be in a list of namespaces`, attribute);
        } else {
            namespaces.add(token);
        }
    }
    return { mode: 'only', namespaces };
};

/**
 * Checks the occurrences of an `xs:all`, which occurs at most once
 * ([XSD 1.1 Part 1 §3.8.6.2](https://www.w3.org/TR/xmlschema11-1/#cos-all-limited)).
 *
 * @param at - the `xs:all`, or the reference to its group
 * @param occurs - its occurrences
 */
const checkAllOccurs = (at: Located, occurs: ReadOccurs | null): void => {
    if (occurs === null || occurs.maxOccurs !== undefined) {
        invalid(at, 'An `xs:all` occurs at most once');
    }
};

/**
 * The attribute declarations and wildcard a type inherits from its base type.
 *
 * @param base - the base type
 * @returns them
 */
const inheritedFrom = (base: ComplexType): Inherited => {
    const attributes = base.attributes ?? [];
    const wildcard = attributes.find(attribute => attribute.kind === 'anyAttribute');
    return {
        attributes: attributes.filter(attribute => attribute.kind === 'attribute'),
        wildcard: wildcard ? fromIr(wildcard) : null,
    };
};

/**
 * Adds a type's own attributes to those of its base type, as an extension does: a name already declared
 * by the base is an error, and the wildcards are united.
 *
 * @param at - the extension
 * @param inherited - the base type's attributes
 * @param uses - the extension's own
 * @returns the attributes of the derived type
 */
const extendAttributes = (at: Located, inherited: Inherited, uses: AttributeUses): Inherited => {
    const names = new Set(inherited.attributes.map(attribute => attributeName(attribute)));
    for (const attribute of uses.attributes) {
        if (names.has(attributeName(attribute))) {
            invalid(
                at,
                `Attribute ${attributeName(attribute)} is already declared by the base type`
            );
        }
    }
    const { wildcard } = inherited;
    return {
        attributes: [...inherited.attributes, ...uses.attributes],
        wildcard:
            wildcard && uses.wildcard
                ? unite(wildcard, uses.wildcard)
                : (wildcard ?? uses.wildcard),
    };
};

/**
 * Restricts the attributes of a base type ([XSD 1.1 Part 1 §3.4.6.3](https://www.w3.org/TR/xmlschema11-1/#derivation-ok-restriction),
 * clauses 2 to 4): the base's are inherited unless redeclared or prohibited, a required one stays
 * required, a fixed one keeps its value, a new one needs the base's wildcard to allow it, and the
 * restriction's wildcard (the only one it has) needs the base to have one.
 *
 * @param at - the restriction
 * @param inherited - the base type's attributes
 * @param uses - the restriction's own
 * @returns the attributes of the derived type
 */
const restrictAttributes = (at: Located, inherited: Inherited, uses: AttributeUses): Inherited => {
    const own = new Map(uses.attributes.map(attribute => [attributeName(attribute), attribute]));
    const attributes: Attribute[] = [];
    for (const attribute of inherited.attributes) {
        const name = attributeName(attribute);
        const redeclared = own.get(name);
        own.delete(name);
        const isKept = redeclared ? redeclared.use === 'required' : !uses.prohibited.has(name);
        if (!isKept && attribute.use === 'required') {
            invalid(at, `Attribute ${name} is required by the base type`);
        }
        if (redeclared) {
            if (attribute.fixed !== undefined && redeclared.fixed !== attribute.fixed) {
                invalid(
                    at,
                    `Attribute ${name} is fixed to ${JSON.stringify(attribute.fixed)} by the base type`
                );
            }
            attributes.push(redeclared);
        } else if (!uses.prohibited.has(name)) {
            attributes.push(attribute);
        }
    }
    for (const [name, attribute] of own) {
        if (!inherited.wildcard || !isAllowed(inherited.wildcard, attribute.namespace ?? null)) {
            invalid(
                at,
                `Attribute ${name} is neither declared nor allowed by a wildcard in the base type`
            );
        }
        attributes.push(attribute);
    }
    if (uses.wildcard && !inherited.wildcard) {
        invalid(at, 'A restriction can only have an attribute wildcard if its base type has one');
    }
    return { attributes, wildcard: uses.wildcard };
};

/**
 * Builds the schema IR from the global components of loaded XSD files.
 *
 * Complex types are created empty when first referenced and filled in later, so an element can refer to a
 * type still being built: the IR is then a graph that may have cycles, which `#breakCycles` turns into
 * `x.lazy` references. Base types, groups and attribute groups are built when needed, as what refers to
 * them needs their content; a cycle among them is an invalid schema.
 */
export class SchemaBuilder {
    readonly #tables: SymbolTables;
    readonly #options: BuildOptions;
    readonly #simple: SimpleTypeBuilder;
    /**
     * Which construct each value of the IR comes from, for errors found when it is compiled.
     */
    readonly #origins = new WeakMap<object, Located>();
    readonly #builtins = new Map<string, Type>();
    readonly #xmlAttributes = createXmlAttributes();
    readonly #globalElements = new Map<XmlElementNode, XsdElement>();
    /**
     * The global declaration each element declaration refers to: itself, or the one its reference copies.
     */
    readonly #globalOf = new WeakMap<Element, Element>();
    readonly #globalAttributes = new Map<XmlElementNode, Attribute>();
    readonly #simpleTypes = new Map<XmlElementNode, SimpleType>();
    readonly #complexTypes = new Map<XmlElementNode, Mutable<ComplexType>>();
    readonly #groups = new Map<XmlElementNode, ModelGroup>();
    readonly #attributeGroups = new Map<XmlElementNode, AttributeUses>();
    /**
     * Simple types, groups and attribute groups being built, to find cycles among them.
     */
    readonly #building = new Set<XmlElementNode>();
    /**
     * Complex types to fill in, in the order they were created, and those being filled in or done.
     */
    readonly #queue: { readonly at: Located; readonly isGlobal: boolean }[] = [];
    readonly #filling = new Set<XmlElementNode>();
    readonly #filled = new Set<XmlElementNode>();
    /**
     * Copies of element declarations without their occurrences, as the target of a lazy reference.
     */
    readonly #stripped = new WeakMap<Element, Element>();

    /**
     * @param tables - global components of every file loaded
     * @param options - how to build
     */
    public constructor(tables: SymbolTables, options: BuildOptions) {
        this.#tables = tables;
        this.#options = options;
        this.#simple = new SimpleTypeBuilder({
            simpleByQName: (at, attribute, text) => this.#simpleByQName(at, attribute, text),
            anonymousSimple: at => this.#simpleType(at, false),
            compile: (type, at) => this.#checked(type, at, () => compileSimple(type, '/')),
            record: (value, at) => this.#record(value, at),
        });
    }

    /**
     * Builds every global component of the files, checks the result as `parse` would, and returns the global
     * elements and named types.
     *
     * @param docs - the files, in document order
     * @returns the schema set
     * @throws {XeneverInvalidSchemaError} when a file breaks the XML Schema rules
     * @throws {XeneverUnsupportedError} when a file uses a construct outside the supported subset
     * @throws {TypeError} when the `ordered` option names a type without child elements
     */
    public build(docs: readonly SchemaDocument[]): XsdSchemaSet {
        const elements: XsdElement[] = [];
        const types: XsdNamedType[] = [];
        for (const doc of docs) {
            for (const at of doc.components) {
                this.#component(at, elements, types);
            }
        }
        // Filling a type queues the anonymous types in it, which the loop reaches in turn.
        for (const { at, isGlobal } of this.#queue) {
            this.#fill(at, isGlobal);
        }
        for (const [node, name] of this.#options.ordered) {
            if (!this.#complexTypes.get(node)!.content) {
                throw new TypeError(
                    `\`ordered\` names ${name}, whose type has no child elements to order`
                );
            }
        }
        this.#breakCycles(elements, types);
        for (const element of elements) {
            this.#checked(element, this.#origins.get(element)!, () => compileElement(element, '/'));
        }
        for (const { type } of types) {
            const origin = this.#origins.get(type)!;
            if (type.kind === 'complex') {
                // A type no element uses is still checked, as the root's type.
                const root = { kind: 'element', name: 'root', type };
                this.#checked(root, origin, () => compileElement(root, '/'));
            } else {
                this.#checked(type, origin, () => compileSimple(type, '/'));
            }
        }
        return { elements, types };
    }

    /**
     * Builds a global component, adding a global element or named type to the schema set.
     *
     * @param at - its element
     * @param elements - global elements so far
     * @param types - named types so far
     */
    #component(at: Located, elements: XsdElement[], types: XsdNamedType[]): void {
        const { localName } = at.node;
        switch (localName) {
            case 'element': {
                elements.push(this.#globalElement(at));

                break;
            }
            case 'simpleType':
            case 'complexType': {
                const { targetNamespace } = at.doc;
                types.push({
                    name: readNcName(
                        at,
                        at.node.attributes.find(
                            attribute =>
                                attribute.namespace === null && attribute.localName === 'name'
                        )!
                    ),
                    ...(targetNamespace !== null && { namespace: targetNamespace }),
                    type:
                        localName === 'simpleType'
                            ? this.#simpleType(at, true)
                            : this.#complexType(at, true),
                });

                break;
            }
            case 'attribute': {
                this.#globalAttribute(at);

                break;
            }
            case 'group': {
                this.#groupModel(at);

                break;
            }
            default: {
                this.#attributeGroup(at);
            }
        }
    }

    /**
     * Records which construct a value of the IR comes from.
     *
     * @param value - a value of the IR
     * @param at - the construct
     * @returns the value
     */
    #record<T extends object>(value: T, at: Located): T {
        this.#origins.set(value, at);
        return value;
    }

    /**
     * Runs a check of the IR, rethrowing a schema error at the construct its path leads to: the path is into
     * the IR, so the error is moved to the deepest value on it that a construct of the XSD made.
     *
     * @param root - the value checked
     * @param fallback - the construct of `root`, when it has none of its own
     * @param run - runs the check
     * @returns what it returns
     * @throws {XeneverInvalidSchemaError} when the IR is invalid
     * @throws {XeneverUnsupportedError} when it uses something xenever doesn't support
     */
    #checked<T>(root: object, fallback: Located, run: () => T): T {
        try {
            return run();
        } catch (error) {
            // Unreachable: compiling throws only schema errors.
            /* c8 ignore next 3 */
            if (!(error instanceof XeneverSchemaError)) {
                throw error;
            }
            let value: unknown = root;
            let at = fallback;
            const segments = error.path.split('/').filter(Boolean);
            for (const segment of segments) {
                const record = value as Readonly<Record<string, unknown>>;
                // A lazy reference's declaration is at `get()`.
                value = segment.endsWith('()')
                    ? (record[segment.replace(/\(\)$/v, '')] as () => unknown)()
                    : record[segment];
                at = this.#origins.get(value as object) ?? at;
            }
            const options = { ...locationIn(at.doc, at.node), cause: error };
            if (error instanceof ShapeConflictError) {
                throw new XeneverUnsupportedError(
                    `${reasonOf(error)}, and the XSD importer has no way to give them separate keys`,
                    options
                );
            }
            throw error instanceof XeneverUnsupportedError
                ? new XeneverUnsupportedError(reasonOf(error), options)
                : new XeneverInvalidSchemaError(reasonOf(error), options);
        }
    }

    /**
     * Builds a built-in type of the XML Schema namespace.
     *
     * @param at - the construct naming it
     * @param localName - its local name
     * @param attribute - the attribute naming it, if any
     * @returns the type, one object per load
     */
    #builtinType(at: Located, localName: string, attribute?: XmlAttributeNode): Type {
        let type = this.#builtins.get(localName);
        if (type) {
            return type;
        }
        const item = listKinds.get(localName);
        if (localName === 'anyType') {
            type = createAnyType();
        } else if (localName === 'anySimpleType') {
            // Any text, as written; only attributes and elements may use it, not restrictions.
            type = { kind: 'string' };
        } else if (atomicKinds.has(localName)) {
            type = {
                kind: localName,
                ...(this.#options.bigint && bigIntegerKinds.has(localName) && { bigint: true }),
            } as SimpleType;
        } else if (item) {
            type = { kind: 'list', item: { kind: item }, facets: { minLength: 1 } };
        } else if (localName === 'NOTATION') {
            return unsupported(at, 'Notations are not supported', attribute);
        } else if (xsd11Types.has(localName)) {
            return unsupported(at, `\`xs:${localName}\` (XSD 1.1) is not supported`, attribute);
        } else {
            return invalid(at, `\`xs:${localName}\` is not a built-in type`, attribute);
        }
        this.#builtins.set(localName, type);
        return type;
    }

    /**
     * The type a QName names.
     *
     * @param at - the construct naming it
     * @param attribute - the attribute naming it
     * @param isComplete - whether a complex type must be filled in already, as a base type must
     * @param text - the QName, when the attribute holds a list of them
     * @returns the type
     * @throws {XeneverInvalidSchemaError} when it names no type
     */
    #typeByQName(
        at: Located,
        attribute: XmlAttributeNode,
        isComplete: boolean,
        text?: string
    ): Type {
        const { namespace, localName } = resolveQName(at, attribute, text);
        if (namespace === xsdNamespace) {
            return this.#builtinType(at, localName, attribute);
        }
        const name = clark(namespace, localName);
        const component =
            this.#tables.types.get(name) ?? invalid(at, `Type ${name} is not defined`, attribute);
        if (component.node.localName === 'simpleType') {
            return this.#simpleType(component, true);
        }
        const type = this.#complexType(component, true);
        if (isComplete) {
            if (this.#filling.has(component.node)) {
                invalid(at, `Type ${name} derives from itself`, attribute);
            }
            this.#fill(component, true);
        }
        return type;
    }

    /**
     * The simple type a QName names.
     *
     * @param at - the construct naming it
     * @param attribute - the attribute naming it
     * @param text - the QName, when the attribute holds a list of them
     * @returns the type
     * @throws {XeneverInvalidSchemaError} when it names no type, or a complex type
     */
    #simpleByQName(at: Located, attribute: XmlAttributeNode, text?: string): SimpleType {
        const type = this.#typeByQName(at, attribute, false, text);
        if (type.kind === 'complex') {
            invalid(
                at,
                `${JSON.stringify(text ?? attribute.value)} is not a simple type`,
                attribute
            );
        }
        return type as SimpleType;
    }

    /**
     * Builds a simple type, once.
     *
     * @param at - its `xs:simpleType` element
     * @param isGlobal - whether it is named
     * @returns the type
     * @throws {XeneverInvalidSchemaError} when it is defined in terms of itself
     */
    #simpleType(at: Located, isGlobal: boolean): SimpleType {
        let type = this.#simpleTypes.get(at.node);
        if (!type) {
            if (this.#building.has(at.node)) {
                invalid(at, 'A simple type is defined in terms of itself');
            }
            this.#building.add(at.node);
            type = this.#simple.simpleType(at, isGlobal);
            this.#building.delete(at.node);
            this.#simpleTypes.set(at.node, type);
        }
        return type;
    }

    /**
     * The object of a complex type, created empty the first time and queued to be filled in.
     *
     * @param at - its `xs:complexType` element
     * @param isGlobal - whether it is named
     * @returns the type
     */
    #complexType(at: Located, isGlobal: boolean): ComplexType {
        let type = this.#complexTypes.get(at.node);
        if (!type) {
            type = this.#record<Mutable<ComplexType>>({ kind: 'complex' }, at);
            this.#complexTypes.set(at.node, type);
            this.#queue.push({ at, isGlobal });
        }
        return type;
    }

    /**
     * Fills in a complex type, unless it already is.
     *
     * @param at - its `xs:complexType` element
     * @param isGlobal - whether it is named
     */
    #fill(at: Located, isGlobal: boolean): void {
        if (this.#filled.has(at.node)) {
            return;
        }
        this.#filling.add(at.node);
        const fields = this.#complexFields(at, isGlobal);
        Object.assign(
            this.#complexTypes.get(at.node)!,
            fields,
            this.#options.ordered.has(at.node) && { ordered: true }
        );
        this.#filling.delete(at.node);
        this.#filled.add(at.node);
    }

    /**
     * The type of an element declaration: its `type`, the anonymous type it holds, or `xs:anyType`.
     *
     * @param at - the declaration
     * @param construct - it, read
     * @returns the type
     */
    #elementType(at: Located, construct: Construct): Type {
        const typeAttribute = construct.attributes.get('type');
        const [inline] = construct.children;
        if (typeAttribute && inline) {
            invalid(inline, 'An element has either a `type` or an anonymous type, not both');
        }
        if (typeAttribute) {
            return this.#typeByQName(at, typeAttribute, false);
        }
        if (inline) {
            return inline.node.localName === 'simpleType'
                ? this.#simpleType(inline, false)
                : this.#complexType(inline, false);
        }
        return this.#builtinType(at, 'anyType');
    }

    /**
     * Builds a global element declaration, once.
     *
     * @param at - its `xs:element` element
     * @returns the declaration
     */
    #globalElement(at: Located): XsdElement {
        const cached = this.#globalElements.get(at.node);
        if (cached) {
            return cached;
        }
        const construct = readConstruct(at, grammars.globalElement);
        const abstract = construct.attributes.get('abstract');
        if (isTrue(at, abstract)) {
            unsupported(at, 'Abstract elements are not supported', abstract);
        }
        checkDerivationSet(at, construct.attributes.get('block'), elementBlock);
        checkDerivationSet(at, construct.attributes.get('final'), typeDerivations);
        const name = readNcName(at, required(at, construct, 'name'));
        const { targetNamespace } = at.doc;
        const declaration = buildElement(name, this.#elementType(at, construct), {
            ...(targetNamespace !== null && { namespace: targetNamespace }),
            ...(isTrue(at, construct.attributes.get('nillable')) && { nillable: true }),
            ...valueConstraint(at, construct),
        }) as unknown as XsdElement;
        this.#record(declaration, at);
        this.#globalOf.set(declaration, declaration);
        this.#globalElements.set(at.node, declaration);
        return declaration;
    }

    /**
     * Builds a local element declaration or reference. Each is reached once, as the type or group holding it
     * is built once.
     *
     * @param at - its `xs:element` element
     * @returns the declaration, or `null` when it can never occur (`maxOccurs="0"`)
     */
    #localElement(at: Located): Element | null {
        const construct = readConstruct(at, grammars.localElement);
        const occurs = readOccurs(at, construct);
        const ref = construct.attributes.get('ref');
        const nameAttribute = construct.attributes.get('name');
        if ((ref === undefined) === (nameAttribute === undefined)) {
            invalid(at, 'A local element has either a `name` or a `ref`, one of them');
        }
        const declaration = ref
            ? this.#elementReference(at, construct, ref, occurs ?? {})
            : this.#localDeclaration(at, construct, nameAttribute!, occurs ?? {});
        return occurs === null ? null : declaration;
    }

    /**
     * Builds a reference to a global element: the declaration itself, or a copy with the reference's
     * occurrences.
     *
     * @param at - the `xs:element` element
     * @param construct - it, read
     * @param ref - its `ref`
     * @param occurs - its occurrences
     * @returns the declaration
     */
    #elementReference(
        at: Located,
        construct: Construct,
        ref: XmlAttributeNode,
        occurs: ReadOccurs
    ): Element {
        for (const name of ['type', 'nillable', 'default', 'fixed', 'form', 'block']) {
            const attribute = construct.attributes.get(name);
            if (attribute) {
                invalid(at, `An element reference can not have \`${name}\``, attribute);
            }
        }
        const [inline] = construct.children;
        if (inline) {
            invalid(inline, 'An element reference can not have an anonymous type');
        }
        const { namespace, localName } = resolveQName(at, ref);
        const name = clark(namespace, localName);
        const global = this.#globalElement(
            this.#tables.elements.get(name) ?? invalid(at, `Element ${name} is not declared`, ref)
        );
        if (Object.keys(occurs).length === 0) {
            return global;
        }
        const declaration = this.#record({ ...global, ...occurs }, at);
        this.#globalOf.set(declaration, global);
        return declaration;
    }

    /**
     * Builds a local element declaration, qualified as its `form` or the schema's `elementFormDefault` says.
     *
     * @param at - the `xs:element` element
     * @param construct - it, read
     * @param nameAttribute - its `name`
     * @param occurs - its occurrences
     * @returns the declaration
     */
    #localDeclaration(
        at: Located,
        construct: Construct,
        nameAttribute: XmlAttributeNode,
        occurs: ReadOccurs
    ): Element {
        const name = readNcName(at, nameAttribute);
        checkDerivationSet(at, construct.attributes.get('block'), elementBlock);
        const form =
            readKeyword(at, construct.attributes.get('form'), ['qualified', 'unqualified']) ??
            (at.doc.qualifiedElements ? 'qualified' : 'unqualified');
        const namespace = form === 'qualified' ? at.doc.targetNamespace : null;
        return this.#record<Element>(
            {
                kind: 'element',
                name,
                type: this.#elementType(at, construct),
                ...(namespace !== null && { namespace }),
                ...(isTrue(at, construct.attributes.get('nillable')) && { nillable: true }),
                ...valueConstraint(at, construct),
                ...occurs,
            },
            at
        );
    }

    /**
     * The type of an attribute declaration: its `type`, the anonymous type it holds, or
     * `xs:anySimpleType`.
     *
     * @param at - the declaration
     * @param construct - it, read
     * @returns the type
     */
    #attributeType(at: Located, construct: Construct): SimpleType {
        const typeAttribute = construct.attributes.get('type');
        const [inline] = construct.children;
        if (typeAttribute && inline) {
            invalid(inline, 'An attribute has either a `type` or an anonymous type, not both');
        }
        if (typeAttribute) {
            return this.#simpleByQName(at, typeAttribute);
        }
        return inline
            ? this.#simpleType(inline, false)
            : (this.#builtinType(at, 'anySimpleType') as SimpleType);
    }

    /**
     * Builds a global attribute declaration, once: always qualified by the target namespace.
     *
     * @param at - its `xs:attribute` element
     * @returns the declaration
     */
    #globalAttribute(at: Located): Attribute {
        let declaration = this.#globalAttributes.get(at.node);
        if (!declaration) {
            const construct = readConstruct(at, grammars.globalAttribute);
            const name = checkAttributeName(at, required(at, construct, 'name'));
            const { targetNamespace } = at.doc;
            if (targetNamespace === xsiNamespace) {
                invalid(at, 'The `xsi` namespace has no attributes but those XML Schema defines');
            }
            declaration = this.#record<Attribute>(
                {
                    kind: 'attribute',
                    name,
                    type: this.#attributeType(at, construct),
                    ...(targetNamespace !== null && { namespace: targetNamespace }),
                    ...valueConstraint(at, construct),
                },
                at
            );
            this.#globalAttributes.set(at.node, declaration);
        }
        return declaration;
    }

    /**
     * Builds a local attribute declaration or reference.
     *
     * @param at - its `xs:attribute` element
     * @returns the declaration, or the name it prohibits (`use="prohibited"`)
     */
    #localAttribute(
        at: Located
    ): { readonly attribute: Attribute } | { readonly prohibited: string } {
        const construct = readConstruct(at, grammars.localAttribute);
        const ref = construct.attributes.get('ref');
        const nameAttribute = construct.attributes.get('name');
        if ((ref === undefined) === (nameAttribute === undefined)) {
            invalid(at, 'A local attribute has either a `name` or a `ref`, one of them');
        }
        const useAttribute = construct.attributes.get('use');
        const use = readKeyword(at, useAttribute, ['optional', 'required', 'prohibited']);
        const constraint = valueConstraint(at, construct);
        if (use !== undefined && use !== 'optional' && constraint.default !== undefined) {
            invalid(at, 'An attribute with a `default` must be optional', useAttribute);
        }
        const requiredUse = use === 'required' ? ({ use: 'required' } as const) : {};
        let declaration: Attribute;
        if (ref) {
            declaration = this.#attributeReference(at, construct, ref, constraint, requiredUse);
        } else {
            const name = checkAttributeName(at, nameAttribute!);
            const form =
                readKeyword(at, construct.attributes.get('form'), ['qualified', 'unqualified']) ??
                (at.doc.qualifiedAttributes ? 'qualified' : 'unqualified');
            const namespace = form === 'qualified' ? at.doc.targetNamespace : null;
            declaration = this.#record<Attribute>(
                {
                    kind: 'attribute',
                    name,
                    type: this.#attributeType(at, construct),
                    ...(namespace !== null && { namespace }),
                    ...requiredUse,
                    ...constraint,
                },
                at
            );
        }
        return use === 'prohibited'
            ? { prohibited: attributeName(declaration) }
            : { attribute: declaration };
    }

    /**
     * Builds a reference to a global attribute: the declaration itself, or a copy with the reference's `use`
     * and value constraint. A fixed value of the declaration can't be changed.
     *
     * @param at - the `xs:attribute` element
     * @param construct - it, read
     * @param ref - its `ref`
     * @param constraint - its value constraint
     * @param requiredUse - `{ use: 'required' }` when it is required, else `{}`
     * @returns the declaration
     */
    #attributeReference(
        at: Located,
        construct: Construct,
        ref: XmlAttributeNode,
        constraint: { readonly default?: string; readonly fixed?: string },
        requiredUse: { readonly use?: 'required' }
    ): Attribute {
        for (const name of ['type', 'form']) {
            const attribute = construct.attributes.get(name);
            if (attribute) {
                invalid(at, `An attribute reference can not have \`${name}\``, attribute);
            }
        }
        const [inline] = construct.children;
        if (inline) {
            invalid(inline, 'An attribute reference can not have an anonymous type');
        }
        const { namespace, localName } = resolveQName(at, ref);
        const name = clark(namespace, localName);
        const component = this.#tables.attributes.get(name);
        const global =
            (component && this.#globalAttribute(component)) ??
            (namespace === xmlNamespace ? this.#xmlAttributes.get(localName) : undefined) ??
            invalid(at, `Attribute ${name} is not declared`, ref);
        const hasOwn = constraint.default !== undefined || constraint.fixed !== undefined;
        if (
            hasOwn &&
            global.fixed !== undefined &&
            (constraint.default !== undefined || constraint.fixed !== global.fixed)
        ) {
            invalid(
                at,
                `Attribute ${name} is fixed to ${JSON.stringify(global.fixed)} by its declaration`,
                ref
            );
        }
        if (!hasOwn && requiredUse.use === undefined) {
            return global;
        }
        // The reference's value constraint replaces the declaration's.
        const inherited = Object.fromEntries(
            Object.entries(global).filter(
                ([key]) => !hasOwn || (key !== 'default' && key !== 'fixed')
            )
        ) as unknown as Attribute;
        return this.#record<Attribute>({ ...inherited, ...requiredUse, ...constraint }, at);
    }

    /**
     * Reads the attribute declarations of a type, derivation or attribute group, attribute groups inlined.
     * Its wildcard is the intersection of its own and those of its attribute groups
     * ([XSD 1.1 Part 1 §3.6.2.2](https://www.w3.org/TR/xmlschema11-1/#declare-attributeGroup-wildcard)).
     *
     * @param children - its `xs:attribute`, `xs:attributeGroup` and `xs:anyAttribute` elements
     * @returns the declarations, prohibited names and wildcard
     * @throws {XeneverInvalidSchemaError} when an attribute is declared twice
     */
    #attributeUses(children: readonly Located[]): AttributeUses {
        const attributes: Attribute[] = [];
        const names = new Set<string>();
        const prohibited = new Set<string>();
        const wildcards: Wildcard[] = [];
        const add = (attribute: Attribute, at: Located): void => {
            const name = attributeName(attribute);
            if (names.has(name)) {
                invalid(at, `Attribute ${name} is declared twice`);
            }
            names.add(name);
            attributes.push(attribute);
        };
        for (const child of children) {
            if (child.node.localName === 'attribute') {
                const use = this.#localAttribute(child);
                if ('prohibited' in use) {
                    prohibited.add(use.prohibited);
                } else {
                    add(use.attribute, child);
                }
            } else if (child.node.localName === 'attributeGroup') {
                const uses = this.#attributeGroupReference(child);
                for (const attribute of uses.attributes) {
                    add(attribute, child);
                }
                for (const name of uses.prohibited) {
                    prohibited.add(name);
                }
                if (uses.wildcard) {
                    wildcards.push(uses.wildcard);
                }
            } else {
                wildcards.push(readWildcard(child, readConstruct(child, grammars.anyAttribute)));
            }
        }
        return {
            attributes,
            prohibited,
            wildcard: intersectAll(wildcards),
        };
    }

    /**
     * Inlines a reference to an attribute group.
     *
     * @param at - the `xs:attributeGroup` element
     * @returns the group's attribute declarations
     */
    #attributeGroupReference(at: Located): AttributeUses {
        const construct = readConstruct(at, grammars.attributeGroupReference);
        const ref = required(at, construct, 'ref');
        const { namespace, localName } = resolveQName(at, ref);
        const name = clark(namespace, localName);
        const component = this.#tables.attributeGroups.get(name);
        if (component) {
            return this.#attributeGroup(component);
        }
        if (namespace === xmlNamespace && localName === 'specialAttrs') {
            return {
                attributes: xmlSpecialAttributes.map(local => this.#xmlAttributes.get(local)!),
                prohibited: new Set(),
                wildcard: null,
            };
        }
        return invalid(at, `Attribute group ${name} is not defined`, ref);
    }

    /**
     * Builds an attribute group, once.
     *
     * @param at - its `xs:attributeGroup` element
     * @returns its attribute declarations
     * @throws {XeneverInvalidSchemaError} when it refers to itself
     */
    #attributeGroup(at: Located): AttributeUses {
        let uses = this.#attributeGroups.get(at.node);
        if (!uses) {
            if (this.#building.has(at.node)) {
                invalid(at, 'An attribute group refers to itself');
            }
            this.#building.add(at.node);
            const construct = readConstruct(at, grammars.attributeGroupDefinition);
            readNcName(at, required(at, construct, 'name'));
            uses = this.#attributeUses(construct.children);
            this.#building.delete(at.node);
            this.#attributeGroups.set(at.node, uses);
        }
        return uses;
    }

    /**
     * Writes a wildcard as an IR attribute wildcard.
     *
     * @param wildcard - the constraint
     * @param at - where it is declared
     * @returns the IR wildcard
     * @throws {XeneverUnsupportedError} when it allows no namespace at all
     */
    #anyAttribute(wildcard: Wildcard, at: Located): AnyAttribute {
        const constraint =
            toIr(wildcard) ??
            unsupported(at, 'A wildcard that allows no namespace is not supported');
        return this.#record<AnyAttribute>({ kind: 'anyAttribute', ...constraint }, at);
    }

    /**
     * Builds an element wildcard.
     *
     * @param at - its `xs:any` element
     * @returns the wildcard, or `null` when it can never occur
     */
    #anyParticle(at: Located): Any | null {
        const construct = readConstruct(at, grammars.any);
        const occurs = readOccurs(at, construct);
        const constraint =
            toIr(readWildcard(at, construct)) ??
            unsupported(at, 'A wildcard that allows no namespace is not supported');
        return occurs === null
            ? null
            : this.#record<Any>({ kind: 'any', ...constraint, ...occurs }, at);
    }

    /**
     * Builds a model group.
     *
     * @param at - its `xs:sequence`, `xs:choice` or `xs:all` element
     * @param isDefinition - whether it is the group of a named `xs:group`, which has no occurrences
     * @returns the group, or `null` when it can never occur
     */
    #modelGroup(at: Located, isDefinition: boolean): ModelGroup | null {
        const kind = at.node.localName as ModelGroup['kind'];
        const construct = readConstruct(at, {
            attributes: isDefinition ? ['id'] : ['minOccurs', 'maxOccurs', 'id'],
            content: [
                kind === 'all'
                    ? many('element', 'any', 'group')
                    : many('element', 'group', 'choice', 'sequence', 'any'),
            ],
        });
        const occurs = readOccurs(at, construct);
        if (kind === 'all') {
            checkAllOccurs(at, occurs);
        }
        const particles: Particle[] = [];
        for (const child of construct.children) {
            const particle = this.#particle(child, kind === 'all');
            if (particle) {
                particles.push(particle);
            }
        }
        return occurs === null
            ? null
            : this.#record<ModelGroup>({ kind, particles, ...occurs }, at);
    }

    /**
     * Builds a particle of a model group.
     *
     * @param at - its element
     * @param isInAll - whether the group is an `xs:all`, which holds only elements that occur at most once
     * @returns the particle, or `null` when it can never occur
     */
    #particle(at: Located, isInAll: boolean): Particle | null {
        const { localName } = at.node;
        if (isInAll && localName !== 'element') {
            unsupported(at, `\`xs:${localName}\` in \`xs:all\` (XSD 1.1) is not supported`);
        }
        switch (localName) {
            case 'element': {
                const declaration = this.#localElement(at);
                if (isInAll && declaration?.maxOccurs !== undefined) {
                    unsupported(
                        at,
                        'An element that occurs more than once in `xs:all` (XSD 1.1) is not supported'
                    );
                }
                return declaration;
            }
            case 'group': {
                return this.#groupReference(at, false);
            }
            case 'any': {
                return this.#anyParticle(at);
            }
            default: {
                return this.#modelGroup(at, false);
            }
        }
    }

    /**
     * Inlines a reference to a named group: the group itself, or a copy with the reference's occurrences.
     *
     * @param at - the `xs:group` element
     * @param isContent - whether it is the whole content of a type, the only place a group of `xs:all` may be
     * @returns the group, or `null` when it can never occur
     */
    #groupReference(at: Located, isContent: boolean): ModelGroup | null {
        const construct = readConstruct(at, grammars.groupReference);
        const occurs = readOccurs(at, construct);
        const ref = required(at, construct, 'ref');
        const { namespace, localName } = resolveQName(at, ref);
        const name = clark(namespace, localName);
        const group = this.#groupModel(
            this.#tables.groups.get(name) ?? invalid(at, `Group ${name} is not defined`, ref)
        );
        if (group.kind === 'all') {
            if (!isContent) {
                invalid(at, 'A group of `xs:all` can only be the whole content of a type');
            }
            checkAllOccurs(at, occurs);
        }
        if (occurs === null) {
            return null;
        }
        return Object.keys(occurs).length === 0 ? group : this.#record({ ...group, ...occurs }, at);
    }

    /**
     * Builds the model group of a named group, once.
     *
     * @param at - its `xs:group` element
     * @returns the model group
     * @throws {XeneverInvalidSchemaError} when it refers to itself
     */
    #groupModel(at: Located): ModelGroup {
        let group = this.#groups.get(at.node);
        if (!group) {
            if (this.#building.has(at.node)) {
                invalid(at, 'A group refers to itself');
            }
            this.#building.add(at.node);
            const construct = readConstruct(at, grammars.groupDefinition);
            readNcName(at, required(at, construct, 'name'));
            // A group's own model group has no occurrences, so is never null.
            const [model] = construct.children as [Located];
            group = this.#modelGroup(model, true)!;
            this.#building.delete(at.node);
            this.#groups.set(at.node, group);
        }
        return group;
    }

    /**
     * Builds the particle a type or derivation starts with.
     *
     * @param at - the `xs:group`, `xs:all`, `xs:choice` or `xs:sequence` element
     * @returns the model group, or `null` when it can never occur
     */
    #contentParticle(at: Located): ModelGroup | null {
        return at.node.localName === 'group'
            ? this.#groupReference(at, true)
            : this.#modelGroup(at, false);
    }

    /**
     * Reads the particle and attributes of a type or derivation.
     *
     * @param children - its child elements
     * @returns its particle, or `null` for none, and its attributes
     */
    #ownContent(children: readonly Located[]): {
        readonly particle: ModelGroup | null;
        readonly uses: AttributeUses;
    } {
        const [first] = children;
        const hasParticle = first !== undefined && particleNames.has(first.node.localName);
        return {
            particle: hasParticle ? this.#contentParticle(first) : null,
            uses: this.#attributeUses(hasParticle ? children.slice(1) : children),
        };
    }

    /**
     * The properties of a complex type, from its content model and attributes.
     *
     * @param particle - its particle, `null` for none
     * @param isMixed - whether it is mixed
     * @param inherited - its attribute declarations and wildcard
     * @param at - the construct, for the values made here
     * @returns the properties; empty content, unless mixed, has no `content`
     */
    #fields(
        particle: ModelGroup | null,
        isMixed: boolean,
        inherited: Inherited,
        at: Located
    ): ComplexFields {
        let content: ModelGroup | null = isEmptyParticle(particle) ? null : particle;
        if (content === null && isMixed) {
            // Mixed content without elements is text only, which the IR writes as an empty sequence.
            content = this.#record<ModelGroup>({ kind: 'sequence', particles: [] }, at);
        }
        const attributes = [
            ...inherited.attributes,
            ...(inherited.wildcard ? [this.#anyAttribute(inherited.wildcard, at)] : []),
        ];
        return {
            ...(attributes.length > 0 && { attributes }),
            ...(content && { content }),
            ...(isMixed && { mixed: true }),
        };
    }

    /**
     * Fills in the properties of a complex type.
     *
     * @param at - its `xs:complexType` element
     * @param isGlobal - whether it is named
     * @returns its properties
     */
    #complexFields(at: Located, isGlobal: boolean): ComplexFields {
        const construct = readConstruct(
            at,
            isGlobal ? grammars.globalComplexType : grammars.localComplexType
        );
        const abstract = construct.attributes.get('abstract');
        if (isTrue(at, abstract)) {
            unsupported(at, 'Abstract types are not supported', abstract);
        }
        checkDerivationSet(at, construct.attributes.get('block'), typeDerivations);
        checkDerivationSet(at, construct.attributes.get('final'), typeDerivations);
        const mixedAttribute = construct.attributes.get('mixed');
        const isMixed = isTrue(at, mixedAttribute);
        const [first, second] = construct.children;
        const { localName } = first?.node ?? {};
        if (localName === 'simpleContent' || localName === 'complexContent') {
            if (second) {
                invalid(second, `${written(second.node)} can not follow ${written(first!.node)}`);
            }
            if (localName === 'complexContent') {
                return this.#complexContent(first!, isMixed);
            }
            if (isMixed) {
                invalid(at, 'A type with simple content can not be mixed', mixedAttribute);
            }
            return this.#simpleContent(first!);
        }
        // Without a derivation, the type restricts `xs:anyType`, which has no attributes to inherit.
        const { particle, uses } = this.#ownContent(construct.children);
        return this.#fields(particle, isMixed, uses, at);
    }

    /**
     * Reads the base type of a derivation, which must be filled in, as its content is copied.
     *
     * @param at - the `xs:extension` or `xs:restriction` element
     * @param construct - it, read
     * @returns the base type, and its `base` attribute
     */
    #base(
        at: Located,
        construct: Construct
    ): { readonly base: Type; readonly attribute: XmlAttributeNode } {
        const attribute = required(at, construct, 'base');
        return { base: this.#typeByQName(at, attribute, true), attribute };
    }

    /**
     * Fills in a complex type with complex content: an extension appends its particle to the base type's, in
     * a sequence; a restriction's own particle is the whole content, as written.
     *
     * @param at - the `xs:complexContent` element
     * @param isTypeMixed - whether the type says it is mixed
     * @returns the type's properties
     */
    #complexContent(at: Located, isTypeMixed: boolean): ComplexFields {
        const construct = readConstruct(at, grammars.complexContent);
        const mixedAttribute = construct.attributes.get('mixed');
        // The `mixed` of `xs:complexContent` overrides the type's.
        const isMixed = mixedAttribute ? isTrue(at, mixedAttribute) : isTypeMixed;
        const [derivation] = construct.children as [Located];
        const derivationConstruct = readConstruct(derivation, grammars.complexDerivation);
        const { base, attribute } = this.#base(derivation, derivationConstruct);
        if (base.kind !== 'complex' || base.text) {
            invalid(
                derivation,
                'Complex content derives from a complex type without simple content',
                attribute
            );
        }
        const baseType = base as ComplexType;
        const { particle, uses } = this.#ownContent(derivationConstruct.children);
        const inherited = inheritedFrom(baseType);
        const isBaseMixed = baseType.mixed === true;
        if (derivation.node.localName === 'restriction') {
            if (isMixed && !isBaseMixed) {
                invalid(
                    derivation,
                    'A restriction of a type without mixed content can not be mixed'
                );
            }
            return this.#fields(
                particle,
                isMixed,
                restrictAttributes(derivation, inherited, uses),
                derivation
            );
        }
        const attributes = extendAttributes(derivation, inherited, uses);
        if (isEmptyParticle(particle)) {
            // Nothing added: the base's content, mixed as it is.
            return this.#fields(
                baseType.content ?? null,
                baseType.content ? isBaseMixed : isMixed,
                attributes,
                derivation
            );
        }
        if (!baseType.content) {
            return this.#fields(particle, isMixed, attributes, derivation);
        }
        if (isMixed !== isBaseMixed) {
            invalid(
                derivation,
                'An extension of a type with content is mixed exactly when its base type is'
            );
        }
        if (baseType.content.kind === 'all' || particle.kind === 'all') {
            invalid(derivation, 'An extension can neither extend nor add an `xs:all`');
        }
        const content = this.#record<ModelGroup>(
            { kind: 'sequence', particles: [baseType.content, particle] },
            derivation
        );
        return this.#fields(content, isMixed, attributes, derivation);
    }

    /**
     * Fills in a complex type with simple content: text of a simple type, and attributes.
     *
     * @param at - the `xs:simpleContent` element
     * @returns the type's properties
     */
    #simpleContent(at: Located): ComplexFields {
        const construct = readConstruct(at, grammars.simpleContent);
        const [derivation] = construct.children as [Located];
        if (derivation.node.localName === 'extension') {
            const derivationConstruct = readConstruct(derivation, grammars.simpleExtension);
            const { base, attribute } = this.#base(derivation, derivationConstruct);
            const uses = this.#attributeUses(derivationConstruct.children);
            if (base.kind !== 'complex') {
                return { ...this.#fields(null, false, uses, derivation), text: base };
            }
            if (!base.text) {
                invalid(
                    derivation,
                    'A simple content extension derives from a simple type or a type with simple content',
                    attribute
                );
            }
            return {
                ...this.#fields(
                    null,
                    false,
                    extendAttributes(derivation, inheritedFrom(base), uses),
                    derivation
                ),
                text: base.text!,
            };
        }
        const derivationConstruct = readConstruct(derivation, grammars.simpleRestriction);
        const { base, attribute } = this.#base(derivation, derivationConstruct);
        if (base.kind !== 'complex' || !base.text) {
            return invalid(
                derivation,
                'A simple content restriction derives from a type with simple content',
                attribute
            );
        }
        const [first] = derivationConstruct.children;
        const inline = first?.node.localName === 'simpleType' ? first : null;
        const rest = derivationConstruct.children.slice(inline ? 1 : 0);
        const facets = rest.filter(child => facetNames.includes(child.node.localName));
        const textBase = inline ? this.#simpleType(inline, false) : base.text;
        const uses = this.#attributeUses(rest.slice(facets.length));
        return {
            ...this.#fields(
                null,
                false,
                restrictAttributes(derivation, inheritedFrom(base), uses),
                derivation
            ),
            text:
                facets.length > 0 ? this.#simple.restrict(derivation, textBase, facets) : textBase,
        };
    }

    /**
     * A lazy reference in place of an element particle, to break a cycle.
     *
     * @param particle - the element particle
     * @returns the reference, with the particle's occurrences, to its global declaration or a copy without
     * occurrences
     */
    #lazy(particle: Element): Lazy {
        const origin = this.#origins.get(particle)!;
        const { minOccurs, maxOccurs, ...declaration } = particle;
        let target = this.#globalOf.get(particle) ?? this.#stripped.get(particle);
        if (!target) {
            target = this.#record(declaration, origin);
            this.#stripped.set(particle, target);
        }
        const declared = target;
        return this.#record(
            lazy(() => declared, {
                ...(minOccurs !== undefined && { minOccurs }),
                ...(maxOccurs !== undefined && { maxOccurs }),
            }),
            origin
        );
    }

    /**
     * Turns the element particles that close a cycle of complex types into lazy references, so the IR is
     * plain data again. Types are walked depth first from the global elements, then the named types, in
     * document order; an element whose type is on the path from the root walked is a reference back into a
     * type still being walked, and becomes `x.lazy`. Groups shared between types (a base type's content, a
     * named group) are walked from each type, since a particle may close a cycle for one and not another.
     *
     * @param elements - global elements
     * @param types - named types
     */
    #breakCycles(elements: readonly Element[], types: readonly XsdNamedType[]): void {
        const path = new Set<ComplexType>();
        const done = new Set<ComplexType>();
        const walkGroup = (group: ModelGroup): void => {
            const particles = group.particles as Particle[];
            for (const [index, particle] of particles.entries()) {
                if (particle.kind === 'element') {
                    if (particle.type.kind === 'complex' && path.has(particle.type)) {
                        particles[index] = this.#lazy(particle);
                    } else {
                        // eslint-disable-next-line @typescript-eslint/no-use-before-define -- Types and groups nest each other
                        walkType(particle.type);
                    }
                } else if (particle.kind !== 'any' && particle.kind !== 'lazy') {
                    walkGroup(particle);
                }
            }
        };
        const walkType = (type: Type): void => {
            if (type.kind !== 'complex' || done.has(type)) {
                return;
            }
            path.add(type);
            if (type.content) {
                walkGroup(type.content);
            }
            path.delete(type);
            done.add(type);
        };
        for (const element of elements) {
            walkType(element.type);
        }
        for (const { type } of types) {
            walkType(type);
        }
    }
}
