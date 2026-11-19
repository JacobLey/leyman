import type {
    Any,
    AnyAttribute,
    Attribute,
    Choice,
    ComplexType,
    Element,
    IdentityConstraint,
    Lazy,
    ModelGroup,
    Particle,
    ProcessContents,
    SimpleType,
    Type,
} from '#internal/lib/schema/ir.js';
import type { CompiledSimple } from '#internal/lib/simple/compile-simple.js';
import type { StandardSchemaV1 } from '#internal/lib/standard-schema.js';
import type { XmlAttributeNode, XmlElementNode } from '#internal/lib/xml/nodes.js';
import type {
    Construct,
    Derivation,
    Grammar,
    Located,
    ReadOccurs,
    SchemaDocument,
} from './located.js';
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
import { parseIdentityPaths } from '#internal/lib/schema/identity.js';
import { InvalidValueError } from '#internal/lib/simple/builtins.js';
import { compileSimple } from '#internal/lib/simple/compile-simple.js';
import { xmlNamespace } from '#internal/lib/xml/nodes.js';
import {
    atomicKinds,
    bigIntegerKinds,
    builtinBases,
    createAnyType,
    createXmlAttributes,
    listKinds,
    xmlSpecialAttributes,
    xsd11Types,
} from './builtins.js';
import {
    checkDerivationSet,
    clark,
    code,
    collapsed,
    invalid,
    isFinal,
    isTrue,
    locationIn,
    many,
    one,
    optional,
    readConstruct,
    readDerivationSet,
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
    readonly wildcard: ReadWildcard | null;
}

/**
 * Attribute declarations and wildcard a type inherits from its base type.
 */
interface Inherited {
    readonly attributes: readonly Attribute[];
    readonly wildcard: ReadWildcard | null;
}

/**
 * A wildcard as read from the XSD: its namespace constraint and `processContents`.
 */
interface ReadWildcard {
    readonly constraint: Wildcard;
    readonly processContents: ProcessContents;
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
 * The identity constraints an element declaration may end with.
 */
const identitySlot = many('unique', 'key', 'keyref');

/**
 * Elements whose content is an element's anonymous type.
 */
const anonymousTypeNames: ReadonlySet<string> = new Set(['simpleType', 'complexType']);

/**
 * An identity constraint, as building records it to check names and `refer`s once every one is built.
 */
interface IdentityDefinition {
    readonly at: Located;
    readonly kind: IdentityConstraint['kind'];
    readonly fields: number;
}

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
            'substitutionGroup',
            'id',
        ],
        content: [optional('simpleType', 'complexType'), identitySlot],
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
        content: [optional('simpleType', 'complexType'), identitySlot],
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
    identity: {
        attributes: ['name', 'id'],
        content: [one('selector'), { names: ['field'], min: 1, max: Number.POSITIVE_INFINITY }],
    },
    keyref: {
        attributes: ['name', 'refer', 'id'],
        content: [one('selector'), { names: ['field'], min: 1, max: Number.POSITIVE_INFINITY }],
    },
    identityPath: { attributes: ['xpath', 'id'], content: [] },
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
 * How a type is derived from the type it names as its base.
 */
type DerivationMethod = 'extension' | 'restriction';

/**
 * One step of a type's derivation: its base type, and how it derives from it.
 */
interface DerivationStep {
    readonly base: Type;
    readonly method: DerivationMethod;
}

/**
 * How a type derives from one of the types it is derived from, over every step between them.
 */
interface DerivationPath {
    /**
     * The methods of the steps.
     */
    readonly methods: ReadonlySet<string>;
    /**
     * The derivations that the ancestor and the types between them `block`
     * ([XSD 1.0 Part 1 §3.4.1](https://www.w3.org/TR/xmlschema-1/#Complex_Type_Definition_details),
     * {prohibited substitutions}).
     */
    readonly blocked: ReadonlySet<string>;
}

/**
 * The child element of an XSD element with one of these names.
 *
 * @param node - an element of an XSD file
 * @param names - local names in the XML Schema namespace
 * @returns the first such child, if any
 */
const childNamed = (node: XmlElementNode, names: readonly string[]): XmlElementNode | undefined =>
    node.children.find(
        (child): child is XmlElementNode =>
            child.kind === 'element' &&
            child.namespace === xsdNamespace &&
            names.includes(child.localName)
    );

/**
 * An attribute of an XSD element, by name.
 *
 * @param node - an element of an XSD file
 * @param name - name of an unqualified attribute
 * @returns the attribute, if present
 */
const attributeNamed = (node: XmlElementNode, name: string): XmlAttributeNode | undefined =>
    node.attributes.find(attribute => attribute.namespace === null && attribute.localName === name);

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
 * Reads a wildcard's namespace constraint.
 *
 * @param at - the `xs:any` or `xs:anyAttribute` element
 * @param construct - it, read
 * @returns the namespaces it allows
 */
const readNamespaceConstraint = (at: Located, construct: Construct): Wildcard => {
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
 * Reads a wildcard: its namespace constraint and `processContents`, `strict` when absent.
 *
 * @param at - the `xs:any` or `xs:anyAttribute` element
 * @param construct - it, read
 * @returns its namespace constraint and `processContents`
 */
const readWildcard = (at: Located, construct: Construct): ReadWildcard => ({
    constraint: readNamespaceConstraint(at, construct),
    processContents:
        readKeyword(at, construct.attributes.get('processContents'), ['skip', 'lax', 'strict']) ??
        'strict',
});

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
        wildcard: wildcard
            ? {
                  constraint: fromIr(wildcard),
                  // Every wildcard the loader builds has one.
                  processContents: wildcard.processContents!,
              }
            : null,
    };
};

/**
 * Adds a type's own attributes to those of its base type, as an extension does: a name already declared
 * by the base is an error, and the wildcards are united, with the extension's `processContents`
 * ([XSD 1.0 Part 1 §3.4.2](https://www.w3.org/TR/xmlschema-1/#declare-type), {attribute wildcard} clause
 * 2.2.2.1.2).
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
                ? {
                      constraint: unite(wildcard.constraint, uses.wildcard.constraint),
                      processContents: uses.wildcard.processContents,
                  }
                : (wildcard ?? uses.wildcard),
    };
};

/**
 * No namespaces: a value written in the schema can't name a `QName`'s.
 */
const noNamespaces: ReadonlyMap<string, string> = new Map();

/**
 * Whether a restriction keeps a fixed value: the same value of the base's type, however it is written
 * ([XSD 1.0 Part 1 §3.4.6](https://www.w3.org/TR/xmlschema-1/#derivation-ok-restriction), clause 2.1.3).
 *
 * @param at - the restriction
 * @param type - the type of the base's attribute
 * @param fixed - the base's fixed value
 * @param redeclared - the restriction's fixed value, if any
 * @returns whether it is the same value
 * @throws {XeneverUnsupportedError} when the type may be a `QName`, which a value written in the schema can't
 * resolve
 */
const isSameFixed = (
    at: Located,
    type: CompiledSimple,
    fixed: string,
    redeclared: string | undefined
): boolean => {
    if (redeclared === undefined) {
        return false;
    }
    if (type.hasQName) {
        unsupported(at, '`fixed` of a type that may be a QName is not supported');
    }
    try {
        return type.isEqual(type.parse(fixed, noNamespaces), type.parse(redeclared, noNamespaces));
    } catch (error) {
        // Unreachable: reading a value throws only invalid values.
        /* c8 ignore next 3 */
        if (!(error instanceof InvalidValueError)) {
            throw error;
        }
        return false;
    }
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
 * @param compile - compiles a simple type, to compare fixed values as values
 * @returns the attributes of the derived type
 */
const restrictAttributes = (
    at: Located,
    inherited: Inherited,
    uses: AttributeUses,
    compile: (type: SimpleType) => CompiledSimple
): Inherited => {
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
            if (
                attribute.fixed !== undefined &&
                !isSameFixed(at, compile(attribute.type), attribute.fixed, redeclared.fixed)
            ) {
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
        if (
            !inherited.wildcard ||
            !isAllowed(inherited.wildcard.constraint, attribute.namespace ?? null)
        ) {
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
    /**
     * Local name of each built-in type built.
     */
    readonly #builtinNames = new Map<Type, string>();
    /**
     * The type each simple type defined in the XSD restricts, `null` for a list or union.
     */
    readonly #simpleBases = new WeakMap<SimpleType, SimpleType | null>();
    readonly #complexBases = new Map<XmlElementNode, DerivationStep>();
    /**
     * The head of each global element's substitution group, with the attribute naming it, in document order.
     */
    readonly #heads = new Map<
        XmlElementNode,
        { readonly at: Located; readonly head: Located; readonly attribute: XmlAttributeNode }
    >();
    readonly #substitutes = new Map<XmlElementNode, readonly XsdElement[]>();
    /**
     * Each element declaration built, with the `xs:element` whose `block` applies to it: its own, or that of
     * the global declaration a reference copies.
     */
    readonly #declarations = new Map<Element, Located>();
    /**
     * The `types` getter of each named complex type, by the derivations blocked for the element, `null` when
     * `xsi:type` may select no other type: one function per type and block, as declarations of one name in a
     * content model must be the same.
     */
    readonly #typeGetters = new Map<
        ComplexType,
        Map<string, (() => readonly ComplexType[]) | null>
    >();
    readonly #xmlAttributes = createXmlAttributes();
    readonly #globalElements = new Map<XmlElementNode, XsdElement>();
    /**
     * The global declaration each element declaration refers to: itself, or the one its reference copies.
     */
    readonly #globalOf = new WeakMap<Element, Element>();
    readonly #globalAttributes = new Map<XmlElementNode, Attribute>();
    /**
     * Global element declarations, in document order, once built: what wildcards validate against.
     */
    readonly #elements: XsdElement[] = [];
    /**
     * Global attribute declarations, in document order, once every component is built.
     */
    #attributes: readonly Attribute[] | null = null;
    #docs: readonly SchemaDocument[] = [];
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
     * Identity constraints by name in Clark notation: one symbol space across the schema set
     * ([XSD 1.0 Part 1 §3.11.1](https://www.w3.org/TR/xmlschema-1/#Identity-constraint_Definition_details)).
     */
    readonly #identities = new Map<string, IdentityDefinition>();
    /**
     * Each keyref's `refer`, checked once every identity constraint is built.
     */
    readonly #refers: {
        readonly at: Located;
        readonly refer: XmlAttributeNode;
        readonly name: string;
        readonly fields: number;
    }[] = [];

    /**
     * @param tables - global components of every file loaded
     * @param options - how to build
     */
    public constructor(tables: SymbolTables, options: BuildOptions) {
        this.#tables = tables;
        this.#options = options;
        this.#simple = new SimpleTypeBuilder({
            simpleByQName: (at, attribute, derivation, text) =>
                this.#simpleByQName(at, attribute, text, derivation),
            anonymousSimple: at => this.#simpleType(at, false),
            compile: (type, at) => this.#checked(type, at, () => compileSimple(type, '/')),
            record: (value, at) => this.#record(value, at),
            derive: (type, base) => {
                this.#simpleBases.set(type, base);
            },
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
        const elements = this.#elements;
        const types: XsdNamedType[] = [];
        this.#docs = docs;
        this.#readSubstitutionGroups(docs);
        for (const doc of docs) {
            for (const at of doc.components) {
                this.#component(at, elements, types);
            }
        }
        // Filling a type queues the anonymous types in it, which the loop reaches in turn.
        for (const { at, isGlobal } of this.#queue) {
            this.#fill(at, isGlobal);
        }
        this.#checkRefers();
        this.#checkSubstitutionGroups();
        this.#assignTypes(types);
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
        for (const attribute of this.#globalAttributes.values()) {
            // An attribute no type uses is still checked, on a root of its own.
            const root = {
                kind: 'element',
                name: 'root',
                type: { kind: 'complex', attributes: [attribute] },
            };
            this.#checked(root, this.#origins.get(attribute)!, () => compileElement(root, '/'));
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
                    name: readNcName(at, attributeNamed(at.node, 'name')!),
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
     * The `declarations` of a wildcard: the global element declarations it allows, read once building is done.
     *
     * @param constraint - its namespace constraint
     * @returns the getter
     */
    #elementDeclarations(constraint: Wildcard): () => readonly Element[] {
        return () =>
            this.#elements.filter(element => isAllowed(constraint, element.namespace ?? null));
    }

    /**
     * The `declarations` of an attribute wildcard: the global attribute declarations it allows, read once
     * building is done. The XML namespace's built-in attributes count when a schema imports that namespace
     * without a file of its own.
     *
     * @param constraint - its namespace constraint
     * @returns the getter
     */
    #attributeDeclarations(constraint: Wildcard): () => readonly Attribute[] {
        return () => {
            if (!this.#attributes) {
                const declared = this.#tables.attributes
                    .values()
                    .map(at => this.#globalAttribute(at))
                    .toArray();
                const isXmlImported =
                    this.#docs.some(doc => doc.references.has(xmlNamespace)) &&
                    declared.every(attribute => attribute.namespace !== xmlNamespace);
                this.#attributes = isXmlImported
                    ? [...declared, ...this.#xmlAttributes.values()]
                    : declared;
            }
            return this.#attributes.filter(attribute =>
                isAllowed(constraint, attribute.namespace ?? null)
            );
        };
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
        const type = this.#builtin(localName);
        if (type) {
            return type;
        }
        if (localName === 'NOTATION') {
            return unsupported(at, 'Notations are not supported', attribute);
        }
        if (xsd11Types.has(localName)) {
            return unsupported(at, `\`xs:${localName}\` (XSD 1.1) is not supported`, attribute);
        }
        return invalid(at, `\`xs:${localName}\` is not a built-in type`, attribute);
    }

    /**
     * Builds a supported built-in type of the XML Schema namespace, once.
     *
     * @param localName - its local name
     * @returns the type, one object per load, or `null` when the name is of none
     */
    #builtin(localName: string): Type | null {
        let type = this.#builtins.get(localName);
        if (type) {
            return type;
        }
        const item = listKinds.get(localName);
        if (localName === 'anyType') {
            const any: Wildcard = { mode: 'any' };
            type = createAnyType(this.#elementDeclarations(any), this.#attributeDeclarations(any));
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
        } else {
            return null;
        }
        this.#builtins.set(localName, type);
        this.#builtinNames.set(type, localName);
        return type;
    }

    /**
     * The step by which a type derives from its base type.
     *
     * @param type - a type of the schema set
     * @returns its base type and the method, or `null` for `xs:anyType`, which derives from nothing
     */
    #derivationStep(type: Type): DerivationStep | null {
        if (type.kind === 'complex') {
            const origin = this.#origins.get(type);
            // Only `xs:anyType` comes from no `xs:complexType` element.
            return origin ? this.#complexBase(origin) : null;
        }
        const builtin = this.#builtinNames.get(type);
        let base: string | null = null;
        if (builtin === undefined) {
            // A simple type the XSD defines: a restriction of its base, or a list or union.
            const restricted = this.#simpleBases.get(type);
            if (restricted) {
                return { base: restricted, method: 'restriction' };
            }
            base = 'anySimpleType';
        } else if (builtin !== 'anySimpleType') {
            base = builtinBases.get(builtin) ?? 'anySimpleType';
        }
        return { base: this.#builtin(base ?? 'anyType')!, method: 'restriction' };
    }

    /**
     * The base type a complex type names, and whether it extends or restricts it, read from its element without
     * filling the type in, so it can be asked of a type still being built. A type that names none restricts
     * `xs:anyType`.
     *
     * @param at - its `xs:complexType` element
     * @returns its base type and the method
     */
    #complexBase(at: Located): DerivationStep {
        let step = this.#complexBases.get(at.node);
        if (!step) {
            const content = childNamed(at.node, ['simpleContent', 'complexContent']);
            const derivation = content && childNamed(content, typeDerivations);
            const base = derivation && attributeNamed(derivation, 'base');
            step =
                derivation && base
                    ? {
                          base: this.#typeByQName({ doc: at.doc, node: derivation }, base, false),
                          method: derivation.localName as DerivationMethod,
                      }
                    : { base: this.#builtin('anyType')!, method: 'restriction' };
            this.#complexBases.set(at.node, step);
        }
        return step;
    }

    /**
     * How a type derives from another, following the base type of each step
     * ([XSD 1.0 Part 1 §3.4.6](https://www.w3.org/TR/xmlschema-1/#cos-ct-derived-ok) and
     * [§3.14.6](https://www.w3.org/TR/xmlschema-1/#cos-st-derived-ok)). A type also derives from a union it,
     * or a type it derives from, is a member of.
     *
     * @param type - the derived type
     * @param ancestor - the type it may derive from
     * @returns the methods of the steps between them, none when they are one type, and what the types on the way
     * block; `null` when `type` doesn't derive from `ancestor`
     */
    #derivationPath(type: Type, ancestor: Type): DerivationPath | null {
        const methods = new Set<string>();
        const blocked = new Set<string>();
        const visited = new Set<Type>();
        let current = type;
        while (current !== ancestor) {
            if (ancestor.kind === 'union' && ancestor.members.includes(current as SimpleType)) {
                // A member of a union derives from it (cos-st-derived-ok, clause 2.2.4).
                methods.add('restriction');
                break;
            }
            const step = this.#derivationStep(current);
            // A type deriving from itself is reported when it is filled in.
            if (step === null || visited.has(current)) {
                return null;
            }
            visited.add(current);
            methods.add(step.method);
            current = step.base;
            const origin = current.kind === 'complex' ? this.#origins.get(current) : undefined;
            if (origin) {
                for (const method of readDerivationSet(origin, 'block', typeDerivations)) {
                    blocked.add(method);
                }
            }
        }
        return { methods, blocked };
    }

    /**
     * Reads the `substitutionGroup` of every global element, before any is built: a reference to a head needs
     * every member of its group, wherever it is declared.
     *
     * @param docs - the files, in document order
     * @throws {XeneverInvalidSchemaError} when one names no global element, or leads back to the element itself
     */
    #readSubstitutionGroups(docs: readonly SchemaDocument[]): void {
        for (const doc of docs) {
            for (const at of doc.components) {
                const attribute =
                    at.node.localName === 'element'
                        ? attributeNamed(at.node, 'substitutionGroup')
                        : undefined;
                if (!attribute) {
                    continue;
                }
                const { namespace, localName } = resolveQName(at, attribute);
                const name = clark(namespace, localName);
                const head =
                    this.#tables.elements.get(name) ??
                    invalid(at, `Element ${name} is not declared`, attribute);
                this.#heads.set(at.node, { at, head, attribute });
            }
        }
        for (const { at, head, attribute } of this.#heads.values()) {
            let current: Located | undefined = head;
            while (current && current.node !== at.node) {
                current = this.#heads.get(current.node)?.head;
            }
            if (current) {
                // E-props-correct.6 ([XSD 1.0 Part 1 §3.3.6](https://www.w3.org/TR/xmlschema-1/#e-props-correct)).
                invalid(at, 'A substitution group can not be circular', attribute);
            }
        }
    }

    /**
     * Every member of a head's substitution group, those of its members included, in document order.
     *
     * @param head - the head's `xs:element` element
     * @returns the `xs:element` element of each member
     */
    #membersOf(head: Located): Located[] {
        const members: Located[] = [];
        for (const { at } of this.#heads.values()) {
            let current = this.#heads.get(at.node);
            while (current && current.head.node !== head.node) {
                current = this.#heads.get(current.head.node);
            }
            if (current) {
                members.push(at);
            }
        }
        return members;
    }

    /**
     * The global elements a reference to one may be in a document
     * ([XSD 1.0 Part 1 §3.3.6](https://www.w3.org/TR/xmlschema-1/#cos-equiv-derived-ok-rec)): itself, then the
     * members of its substitution group, unless its `block` lists `substitution`, or lists (as its type or a
     * type between them may) a method by which the member's type derives from its own. Abstract ones are
     * left out, as they can't be in a document, though their own members still stand in.
     *
     * @param at - its `xs:element` element
     * @returns the declarations
     */
    #substitutesOf(at: Located): readonly XsdElement[] {
        let substitutes = this.#substitutes.get(at.node);
        if (!substitutes) {
            const head = this.#globalElement(at);
            const block = readDerivationSet(at, 'block', elementBlock);
            const members = block.has('substitution') ? [] : this.#membersOf(at);
            substitutes = [head, ...members.map(member => this.#globalElement(member))].filter(
                member => {
                    if (member.abstract === true) {
                        return false;
                    }
                    // A member whose type doesn't derive from the head's is reported once every type is read.
                    const path = this.#derivationPath(member.type, head.type);
                    return (
                        path !== null &&
                        path.methods.isDisjointFrom(block) &&
                        path.methods.isDisjointFrom(path.blocked)
                    );
                }
            );
            this.#substitutes.set(at.node, substitutes);
        }
        return substitutes;
    }

    /**
     * Gives each element declaration built its `types`: the named complex types an `xsi:type` may select for
     * it, in document order, when there are any. They are those derived from its type that aren't abstract,
     * by no method that its `block` or its type's lists
     * ([XSD 1.0 Part 1 §3.3.4](https://www.w3.org/TR/xmlschema-1/#cvc-elt), clause 4.3). Done once every type
     * is filled in, as a type may be derived from one defined after the elements using it.
     *
     * @param named - the named types, in document order
     */
    #assignTypes(named: readonly XsdNamedType[]): void {
        const candidates = named
            .map(({ type }) => type)
            .filter(
                (type): type is ComplexType => type.kind === 'complex' && type.abstract !== true
            );
        for (const [declaration, at] of this.#declarations) {
            const { type } = declaration;
            const origin = type.kind === 'complex' ? this.#origins.get(type) : undefined;
            // Only a named type has types derived from it; `xs:anyType`, which all derive from, has no origin.
            if (!origin || type.kind !== 'complex' || type.name === undefined) {
                continue;
            }
            const block = new Set([
                ...readDerivationSet(at, 'block', typeDerivations),
                ...readDerivationSet(origin, 'block', typeDerivations),
            ]);
            const blockKey = [...block].toSorted((a, b) => a.localeCompare(b)).join(' ');
            let getters = this.#typeGetters.get(type);
            if (!getters) {
                getters = new Map();
                this.#typeGetters.set(type, getters);
            }
            let getter = getters.get(blockKey);
            if (getter === undefined) {
                const types = candidates.filter(
                    candidate =>
                        candidate !== type &&
                        this.#derivationPath(candidate, type)?.methods.isDisjointFrom(block) ===
                            true
                );
                getter = types.length === 0 ? null : () => types;
                getters.set(blockKey, getter);
            }
            if (getter) {
                (declaration as Mutable<Element>).types = getter;
            }
        }
    }

    /**
     * Checks each member of a substitution group has a type that derives from its head's, by no method the
     * head's `final` lists ([XSD 1.0 Part 1 §3.3.6](https://www.w3.org/TR/xmlschema-1/#e-props-correct),
     * clause 4).
     *
     * @throws {XeneverInvalidSchemaError} when a member's type doesn't
     */
    #checkSubstitutionGroups(): void {
        for (const { at, head, attribute } of this.#heads.values()) {
            const member = this.#globalElement(at);
            const declared = this.#globalElement(head);
            const name = clark(declared.namespace ?? null, declared.name);
            const path = this.#derivationPath(member.type, declared.type);
            if (path === null) {
                invalid(
                    at,
                    `The type of an element must derive from the type of ${name}, the head of its substitution group`,
                    attribute
                );
            }
            const final = readDerivationSet(head, 'final', typeDerivations);
            const method = [...path!.methods].find(used => final.has(used));
            if (method !== undefined) {
                invalid(
                    at,
                    `Element ${name} is final for ${method}, by which the type of this member of its substitution group derives from its type`,
                    attribute
                );
            }
        }
    }

    /**
     * The type a QName names.
     *
     * @param at - the construct naming it
     * @param attribute - the attribute naming it
     * @param isComplete - whether a complex type must be filled in already, as a base type must
     * @param text - the QName, when the attribute holds a list of them
     * @param derivation - how the type is derived from, if it is
     * @returns the type
     * @throws {XeneverInvalidSchemaError} when it names no type, or one final for the derivation
     */
    #typeByQName(
        at: Located,
        attribute: XmlAttributeNode,
        isComplete: boolean,
        text?: string,
        derivation?: Derivation
    ): Type {
        const { namespace, localName } = resolveQName(at, attribute, text);
        if (namespace === xsdNamespace) {
            return this.#builtinType(at, localName, attribute);
        }
        const name = clark(namespace, localName);
        const component =
            this.#tables.types.get(name) ?? invalid(at, `Type ${name} is not defined`, attribute);
        if (derivation !== undefined && isFinal(component, derivation)) {
            invalid(
                at,
                `Type ${name} is final for ${derivation}, so it can not be derived from here`,
                attribute
            );
        }
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
     * @param derivation - how the type is derived from, if it is
     * @returns the type
     * @throws {XeneverInvalidSchemaError} when it names no type, a complex type, or one final for the
     * derivation
     */
    #simpleByQName(
        at: Located,
        attribute: XmlAttributeNode,
        text?: string,
        derivation?: Derivation
    ): SimpleType {
        const type = this.#typeByQName(at, attribute, false, text, derivation);
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
     * The object of a complex type, created the first time with only its name, if it has one, and queued to be
     * filled in.
     *
     * @param at - its `xs:complexType` element
     * @param isGlobal - whether it is named
     * @returns the type
     */
    #complexType(at: Located, isGlobal: boolean): ComplexType {
        let type = this.#complexTypes.get(at.node);
        if (!type) {
            const { targetNamespace } = at.doc;
            type = this.#record<Mutable<ComplexType>>(
                {
                    kind: 'complex',
                    ...(isGlobal && {
                        name: readNcName(at, attributeNamed(at.node, 'name')!),
                        ...(targetNamespace !== null && { namespace: targetNamespace }),
                    }),
                },
                at
            );
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
        const inline = construct.children.find(child =>
            anonymousTypeNames.has(child.node.localName)
        );
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
        // Without a type of its own, a member of a substitution group has its head's
        // ([XSD 1.0 Part 1 §3.3.2](https://www.w3.org/TR/xmlschema-1/#declare-element)).
        const head = this.#heads.get(at.node);
        return head ? this.#globalElement(head.head).type : this.#builtinType(at, 'anyType');
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
        checkDerivationSet(at, construct.attributes.get('block'), elementBlock);
        checkDerivationSet(at, construct.attributes.get('final'), typeDerivations);
        const name = readNcName(at, required(at, construct, 'name'));
        const { targetNamespace } = at.doc;
        const declaration = buildElement(name, this.#elementType(at, construct), {
            ...(targetNamespace !== null && { namespace: targetNamespace }),
            ...(isTrue(at, construct.attributes.get('nillable')) && { nillable: true }),
            ...valueConstraint(at, construct),
            ...this.#identity(construct),
            ...(isTrue(at, construct.attributes.get('abstract')) && { abstract: true }),
        }) as unknown as XsdElement;
        this.#record(declaration, at);
        this.#globalOf.set(declaration, declaration);
        this.#globalElements.set(at.node, declaration);
        this.#declarations.set(declaration, at);
        return declaration;
    }

    /**
     * Builds a local element declaration or reference. Each is reached once, as the type or group holding it
     * is built once.
     *
     * @param at - its `xs:element` element
     * @returns the declaration, a choice of the elements that may stand for the one referred to, or `null` when
     * it can never occur (`maxOccurs="0"`)
     */
    #localElement(at: Located): Choice | Element | null {
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
     * occurrences. When members of its substitution group may stand for it, the reference is a choice of them
     * all, with the reference's occurrences; when it is abstract and only one may, that one.
     *
     * @param at - the `xs:element` element
     * @param construct - it, read
     * @param ref - its `ref`
     * @param occurs - its occurrences
     * @returns the declaration, or the choice
     */
    #elementReference(
        at: Located,
        construct: Construct,
        ref: XmlAttributeNode,
        occurs: ReadOccurs
    ): Choice | Element {
        for (const name of ['type', 'nillable', 'default', 'fixed', 'form', 'block']) {
            const attribute = construct.attributes.get(name);
            if (attribute) {
                invalid(at, `An element reference can not have \`${name}\``, attribute);
            }
        }
        const [inline] = construct.children;
        if (inline) {
            invalid(
                inline,
                anonymousTypeNames.has(inline.node.localName)
                    ? 'An element reference can not have an anonymous type'
                    : 'An element reference can not have identity constraints'
            );
        }
        const { namespace, localName } = resolveQName(at, ref);
        const name = clark(namespace, localName);
        const component =
            this.#tables.elements.get(name) ?? invalid(at, `Element ${name} is not declared`, ref);
        const substitutes = this.#substitutesOf(component);
        if (substitutes.length > 1) {
            return this.#record<Choice>(
                { kind: 'choice', particles: [...substitutes], ...occurs },
                at
            );
        }
        // An abstract head nothing stands for is itself, which matches no element.
        const global = substitutes[0] ?? this.#globalElement(component);
        if (Object.keys(occurs).length === 0) {
            return global;
        }
        const declaration = this.#record({ ...global, ...occurs }, at);
        this.#globalOf.set(declaration, global);
        this.#declarations.set(declaration, this.#declarations.get(global)!);
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
        const declaration = this.#record<Element>(
            {
                kind: 'element',
                name,
                type: this.#elementType(at, construct),
                ...(namespace !== null && { namespace }),
                ...(isTrue(at, construct.attributes.get('nillable')) && { nillable: true }),
                ...valueConstraint(at, construct),
                ...this.#identity(construct),
                ...occurs,
            },
            at
        );
        this.#declarations.set(declaration, at);
        return declaration;
    }

    /**
     * Builds the identity constraints of an element declaration.
     *
     * @param construct - the declaration, read
     * @returns its `identity` property, absent when it has none
     */
    #identity(construct: Construct): { readonly identity?: readonly IdentityConstraint[] } {
        const identity = construct.children
            .filter(child => !anonymousTypeNames.has(child.node.localName))
            .map(child => this.#identityConstraint(child));
        return identity.length === 0 ? {} : { identity };
    }

    /**
     * Builds an identity constraint, checking its paths are in the XPath subset of
     * [XSD 1.0 Part 1 §3.11.6](https://www.w3.org/TR/xmlschema-1/#coss-identity-constraint), and recording the
     * prefixes they use from the scope of each `xs:selector` and `xs:field`.
     *
     * @param at - its `xs:key`, `xs:keyref` or `xs:unique` element
     * @returns the constraint
     * @throws {XeneverInvalidSchemaError} when its name is taken, or a path is invalid or uses an unbound prefix
     * @throws {XeneverUnsupportedError} when its paths bind one prefix to different namespaces
     */
    #identityConstraint(at: Located): IdentityConstraint {
        const kind = at.node.localName as IdentityConstraint['kind'];
        const construct = readConstruct(
            at,
            kind === 'keyref' ? grammars.keyref : grammars.identity
        );
        const name = readNcName(at, required(at, construct, 'name'));
        const { targetNamespace } = at.doc;
        const namespaces = new Map<string, string>();
        const [selectorAt, ...fieldsAt] = construct.children as [Located, ...Located[]];
        const path = (pathAt: Located): string => {
            const xpath = required(pathAt, readConstruct(pathAt, grammars.identityPath), 'xpath');
            const text = collapsed(xpath);
            parseIdentityPaths(
                text,
                pathAt.node.localName === 'field',
                prefix => {
                    const namespace = pathAt.node.inScopeNamespaces.get(prefix);
                    const recorded = namespaces.get(prefix);
                    if (
                        namespace !== undefined &&
                        recorded !== undefined &&
                        recorded !== namespace
                    ) {
                        unsupported(
                            pathAt,
                            `The prefix ${code(prefix)} is bound to different namespaces in the paths of one identity constraint, which is not supported`,
                            xpath
                        );
                    }
                    if (namespace !== undefined) {
                        namespaces.set(prefix, namespace);
                    }
                    return namespace;
                },
                message =>
                    invalid(
                        pathAt,
                        `${JSON.stringify(text)} is not in the XPath subset of identity constraints: ${message}`,
                        xpath
                    )
            );
            return text;
        };
        const selector = path(selectorAt);
        const fields = fieldsAt.map(fieldAt => path(fieldAt));

        const clarkName = clark(targetNamespace, name);
        const existing = this.#identities.get(clarkName);
        if (existing && existing.at.node !== at.node) {
            invalid(at, `Identity constraint ${clarkName} is declared twice`);
        }
        this.#identities.set(clarkName, { at, kind, fields: fields.length });
        let referName: { readonly name: string; readonly namespace?: string } | null = null;
        if (kind === 'keyref') {
            const refer = required(at, construct, 'refer');
            const resolved = resolveQName(at, refer);
            this.#refers.push({
                at,
                refer,
                name: clark(resolved.namespace, resolved.localName),
                fields: fields.length,
            });
            referName = {
                name: resolved.localName,
                ...(resolved.namespace !== null && { namespace: resolved.namespace }),
            };
        }
        return this.#record(
            {
                kind,
                name,
                ...(targetNamespace !== null && { namespace: targetNamespace }),
                ...(referName && { refer: referName }),
                selector,
                fields,
                ...(namespaces.size > 0 && {
                    namespaces: Object.fromEntries(namespaces),
                }),
            } as IdentityConstraint,
            at
        );
    }

    /**
     * Checks each keyref refers to a `key` or `unique` constraint with as many fields
     * ([XSD 1.0 Part 1 §3.11.6](https://www.w3.org/TR/xmlschema-1/#c-props-correct), clause 2).
     *
     * @throws {XeneverInvalidSchemaError} when one refers to no constraint, to a keyref, or to one with another
     * number of fields
     */
    #checkRefers(): void {
        for (const { at, refer, name, fields } of this.#refers) {
            const target =
                this.#identities.get(name) ??
                invalid(at, `Identity constraint ${name} is not declared`, refer);
            if (target.kind === 'keyref') {
                invalid(
                    at,
                    `\`refer\` must name a key or unique constraint, not keyref ${name}`,
                    refer
                );
            }
            if (target.fields !== fields) {
                invalid(
                    at,
                    `A keyref has as many fields as the constraint it refers to: ${name} has ${target.fields}, not ${fields}`,
                    refer
                );
            }
        }
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
     * ([XSD 1.1 Part 1 §3.6.2.2](https://www.w3.org/TR/xmlschema11-1/#declare-attributeGroup-wildcard)), with
     * the `processContents` of its own, else of the first attribute group's
     * ([XSD 1.0 Part 1 §3.4.2](https://www.w3.org/TR/xmlschema-1/#declare-type), {attribute wildcard} clause
     * 2.2).
     *
     * @param children - its `xs:attribute`, `xs:attributeGroup` and `xs:anyAttribute` elements
     * @returns the declarations, prohibited names and wildcard
     * @throws {XeneverInvalidSchemaError} when an attribute is declared twice
     */
    #attributeUses(children: readonly Located[]): AttributeUses {
        const attributes: Attribute[] = [];
        const names = new Set<string>();
        const prohibited = new Set<string>();
        const wildcards: ReadWildcard[] = [];
        let own: ReadWildcard | null = null;
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
                own = readWildcard(child, readConstruct(child, grammars.anyAttribute));
                wildcards.push(own);
            }
        }
        const constraint = intersectAll(wildcards.map(wildcard => wildcard.constraint));
        return {
            attributes,
            prohibited,
            wildcard: constraint && {
                constraint,
                processContents: (own ?? wildcards[0]!).processContents,
            },
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
    #anyAttribute(wildcard: ReadWildcard, at: Located): AnyAttribute {
        const constraint =
            toIr(wildcard.constraint) ??
            unsupported(at, 'A wildcard that allows no namespace is not supported');
        const { processContents } = wildcard;
        return this.#record<AnyAttribute>(
            {
                kind: 'anyAttribute',
                ...constraint,
                processContents,
                ...(processContents !== 'skip' && {
                    declarations: this.#attributeDeclarations(wildcard.constraint),
                }),
            },
            at
        );
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
        const wildcard = readWildcard(at, construct);
        const constraint =
            toIr(wildcard.constraint) ??
            unsupported(at, 'A wildcard that allows no namespace is not supported');
        const { processContents } = wildcard;
        return occurs === null
            ? null
            : this.#record<Any>(
                  {
                      kind: 'any',
                      ...constraint,
                      processContents,
                      ...(processContents !== 'skip' && {
                          declarations: this.#elementDeclarations(wildcard.constraint),
                      }),
                      ...occurs,
                  },
                  at
              );
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
                if (isInAll && declaration?.kind === 'choice') {
                    unsupported(
                        at,
                        'A reference in `xs:all` to an element with a substitution group is not supported'
                    );
                }
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
        const abstract = isTrue(at, construct.attributes.get('abstract')) && { abstract: true };
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
                return { ...abstract, ...this.#complexContent(first!, isMixed) };
            }
            if (isMixed) {
                invalid(at, 'A type with simple content can not be mixed', mixedAttribute);
            }
            return { ...abstract, ...this.#simpleContent(first!) };
        }
        // Without a derivation, the type restricts `xs:anyType`, which has no attributes to inherit.
        const { particle, uses } = this.#ownContent(construct.children);
        return { ...abstract, ...this.#fields(particle, isMixed, uses, at) };
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
        return {
            base: this.#typeByQName(
                at,
                attribute,
                true,
                undefined,
                at.node.localName as Derivation
            ),
            attribute,
        };
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
                restrictAttributes(derivation, inherited, uses, type =>
                    this.#checked(type, derivation, () => compileSimple(type, '/'))
                ),
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
                restrictAttributes(derivation, inheritedFrom(base), uses, type =>
                    this.#checked(type, derivation, () => compileSimple(type, '/'))
                ),
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
