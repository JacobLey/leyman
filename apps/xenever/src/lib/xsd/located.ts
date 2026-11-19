import type { SchemaErrorLocation, XmlLocation } from '#internal/lib/errors.js';
import type { XmlAttributeNode, XmlElementNode } from '#internal/lib/xml/nodes.js';
import { XeneverInvalidSchemaError, XeneverUnsupportedError } from '#internal/lib/errors.js';
import { processWhitespace } from '#internal/lib/simple/builtins.js';
import { ncNamePattern } from '#internal/lib/simple/names.js';

/**
 * Namespace name of XML Schema's own elements and built-in types.
 */
export const xsdNamespace = 'http://www.w3.org/2001/XMLSchema';

/**
 * Namespace name of the `xsi` attributes, which no schema may declare
 * ([XSD 1.1 Part 1 §3.2.6.4](https://www.w3.org/TR/xmlschema11-1/#no-xsi)).
 */
export const xsiNamespace = 'http://www.w3.org/2001/XMLSchema-instance';

/**
 * An XSD file, read.
 */
export interface SchemaDocument {
    /**
     * Path of the file, resolved.
     */
    readonly filePath: string;
    /**
     * Its `xs:schema` element.
     */
    readonly root: XmlElementNode;
    readonly targetNamespace: string | null;
    /**
     * Whether local elements are qualified by default (`elementFormDefault="qualified"`).
     */
    readonly qualifiedElements: boolean;
    /**
     * Whether local attributes are qualified by default (`attributeFormDefault="qualified"`).
     */
    readonly qualifiedAttributes: boolean;
    /**
     * Namespaces its QNames may refer to, besides XML Schema's own: its target namespace, and those it imports
     * ([XSD 1.1 Part 1 §3.17.6.2](https://www.w3.org/TR/xmlschema11-1/#src-resolve), clause 4). Filled in
     * as its imports are read.
     */
    readonly references: Set<string | null>;
    /**
     * Its global components: child elements of `xs:schema` but annotations, includes and imports.
     */
    readonly components: readonly Located[];
}

/**
 * An element of an XSD file, with the file it is in.
 */
export interface Located {
    readonly doc: SchemaDocument;
    readonly node: XmlElementNode;
}

/**
 * Where something in an XSD file is, for an error.
 *
 * @param doc - the file
 * @param target - the element or attribute, or a location with its path
 * @param target.location - where it starts
 * @param target.path - path to it in the file
 * @returns the error location
 */
export const locationIn = (
    doc: SchemaDocument,
    target: { readonly location: XmlLocation; readonly path: string }
): SchemaErrorLocation => ({
    filePath: doc.filePath,
    line: target.location.line,
    column: target.location.column,
    path: target.path,
});

/**
 * Throws that an XSD breaks the XML Schema rules.
 *
 * @param at - the construct
 * @param message - what is wrong
 * @param attribute - its attribute that is wrong, if it is one
 * @throws {XeneverInvalidSchemaError} always
 */
export const invalid = (at: Located, message: string, attribute?: XmlAttributeNode): never => {
    throw new XeneverInvalidSchemaError(message, locationIn(at.doc, attribute ?? at.node));
};

/**
 * Throws that an XSD uses a construct xenever doesn't support.
 *
 * @param at - the construct
 * @param message - what is not supported
 * @param attribute - its attribute that is not supported, if it is one
 * @throws {XeneverUnsupportedError} always
 */
export const unsupported = (at: Located, message: string, attribute?: XmlAttributeNode): never => {
    throw new XeneverUnsupportedError(message, locationIn(at.doc, attribute ?? at.node));
};

/**
 * Quotes a name or value as code, for errors.
 *
 * @param text - what to quote
 * @returns it in backticks
 */
export const code = (text: string): string => `\`${text}\``;

/**
 * Lists names or values as code, for errors.
 *
 * @param texts - what to list, one or more
 * @param conjunction - the word before the last
 * @returns e.g. `` `a`, `b` or `c` ``
 */
export const codeList = (texts: readonly string[], conjunction: 'and' | 'or'): string => {
    const quoted = texts.map(text => code(text));
    return quoted.length === 1
        ? quoted[0]!
        : `${quoted.slice(0, -1).join(', ')} ${conjunction} ${quoted.at(-1)!}`;
};

/**
 * Name of an XSD element as written, for errors.
 *
 * @param node - the element
 * @returns e.g. `` `xs:sequence` ``
 */
export const written = (node: XmlElementNode): string =>
    code(node.prefix === null ? node.localName : `${node.prefix}:${node.localName}`);

/**
 * Names a component by namespace and local name in Clark notation: `{namespace}local`, or `local` in no
 * namespace. The key of the symbol tables, and how errors and the `ordered` option name components.
 *
 * @param namespace - namespace name, `null` for none
 * @param localName - name without its prefix
 * @returns the name
 */
export const clark = (namespace: string | null, localName: string): string =>
    namespace === null ? localName : `{${namespace}}${localName}`;

/**
 * A slot of an XSD element's content: which elements may come there, and how many.
 */
interface Slot {
    readonly names: readonly string[];
    /**
     * Fewest elements, 0 when absent.
     */
    readonly min?: number;
    /**
     * Most elements, 1 when absent.
     */
    readonly max?: number;
}

/**
 * What an XSD element may hold: its attributes (unqualified), and its child elements, slot after slot in
 * order. `any` content is unchecked, as in `xs:documentation`.
 */
export interface Grammar {
    readonly attributes: readonly string[];
    readonly content: 'any' | readonly Slot[];
}

/**
 * Any number of these elements.
 *
 * @param names - local names
 * @returns the slot
 */
export const many = (...names: readonly string[]): Slot => ({
    names,
    max: Number.POSITIVE_INFINITY,
});

/**
 * At most one of these elements.
 *
 * @param names - local names
 * @returns the slot
 */
export const optional = (...names: readonly string[]): Slot => ({ names });

/**
 * Exactly one of these elements.
 *
 * @param names - local names
 * @returns the slot
 */
export const one = (...names: readonly string[]): Slot => ({ names, min: 1 });

/**
 * The slot every XSD element starts with.
 */
const annotationSlot = optional('annotation');

/**
 * An XSD element read against its grammar: its attributes by name, and its child elements but annotations.
 */
export interface Construct {
    readonly attributes: ReadonlyMap<string, XmlAttributeNode>;
    readonly children: readonly Located[];
}

/**
 * XSD elements outside the supported subset, and why.
 */
const unsupportedElements: ReadonlyMap<string, string> = new Map([
    ['redefine', '`xs:redefine` is not supported'],
    ['override', '`xs:override` (XSD 1.1) is not supported'],
    ['notation', 'Notations are not supported'],
    ['assert', '`xs:assert` (XSD 1.1) is not supported'],
    ['assertion', '`xs:assertion` (XSD 1.1) is not supported'],
    ['alternative', '`xs:alternative` (XSD 1.1) is not supported'],
    ['openContent', '`xs:openContent` (XSD 1.1) is not supported'],
    ['defaultOpenContent', '`xs:defaultOpenContent` (XSD 1.1) is not supported'],
    ['explicitTimezone', '`xs:explicitTimezone` (XSD 1.1) is not supported'],
]);

/**
 * Attributes of XSD elements outside the supported subset, and why.
 */
const unsupportedAttributes: ReadonlyMap<string, string> = new Map([
    ['substitutionGroup', 'Substitution groups are not supported'],
    ['targetNamespace', '`targetNamespace` on a local declaration (XSD 1.1) is not supported'],
    ['inheritable', '`inheritable` (XSD 1.1) is not supported'],
    ['defaultAttributes', '`defaultAttributes` (XSD 1.1) is not supported'],
    ['defaultAttributesApply', '`defaultAttributesApply` (XSD 1.1) is not supported'],
    ['xpathDefaultNamespace', '`xpathDefaultNamespace` (XSD 1.1) is not supported'],
    ['notNamespace', '`notNamespace` (XSD 1.1) is not supported'],
    ['notQName', '`notQName` (XSD 1.1) is not supported'],
]);

/**
 * Whitespace as XML defines it.
 */
const whitespaceOnly = /^[\t\n\r ]*$/v;

/**
 * Grammar of `xs:annotation`, and of what it holds.
 */
const annotationGrammar: Grammar = {
    attributes: ['id'],
    content: [many('appinfo', 'documentation')],
};
const appinfoGrammar: Grammar = { attributes: ['source'], content: 'any' };

/**
 * Reads an XSD element against its grammar
 * ([XSD 1.1 Part 1 §3](https://www.w3.org/TR/xmlschema11-1/#components)): attributes in another namespace
 * than XML Schema's annotate it and are ignored, as are annotations.
 *
 * @param at - the element
 * @param grammar - what it may hold
 * @returns its attributes and children
 * @throws {XeneverInvalidSchemaError} when it has an unknown or misplaced attribute, child or text
 * @throws {XeneverUnsupportedError} when it uses an attribute or child outside the supported subset
 */
export const readConstruct = (at: Located, grammar: Grammar): Construct => {
    const attributes = new Map<string, XmlAttributeNode>();
    for (const attribute of at.node.attributes) {
        if (attribute.namespace === null) {
            if (grammar.attributes.includes(attribute.localName)) {
                attributes.set(attribute.localName, attribute);
                continue;
            }
            const reason = unsupportedAttributes.get(attribute.localName);
            if (reason !== undefined) {
                unsupported(at, reason, attribute);
            }
            invalid(
                at,
                `Unknown attribute \`${attribute.localName}\` on ${written(at.node)}`,
                attribute
            );
        } else if (attribute.namespace === xsdNamespace) {
            invalid(at, `Attributes in the XML Schema namespace are not allowed`, attribute);
        }
    }
    if (grammar.content === 'any') {
        return { attributes, children: [] };
    }

    // An annotation, which every other XSD element may start with, holds none itself.
    const slots =
        grammar === annotationGrammar ? grammar.content : [annotationSlot, ...grammar.content];
    const children: Located[] = [];
    let slot = 0;
    let count = 0;
    const missing = (index: number, node: Located): never =>
        invalid(
            node,
            `${written(at.node)} is missing ${codeList(
                slots[index]!.names.map(name => `xs:${name}`),
                'or'
            )}`
        );
    for (const child of at.node.children) {
        if (child.kind === 'text') {
            if (!whitespaceOnly.test(child.text)) {
                throw new XeneverInvalidSchemaError(
                    `Text is not allowed in ${written(at.node)}`,
                    locationIn(at.doc, { location: child.location, path: at.node.path })
                );
            }
            continue;
        }
        const located = { doc: at.doc, node: child };
        if (child.namespace !== xsdNamespace) {
            invalid(located, `${written(child)} is not allowed in ${written(at.node)}`);
        }
        const reason = unsupportedElements.get(child.localName);
        if (reason !== undefined) {
            unsupported(located, reason);
        }
        while (
            slot < slots.length &&
            !(slots[slot]!.names.includes(child.localName) && count < (slots[slot]!.max ?? 1))
        ) {
            if (count < (slots[slot]!.min ?? 0)) {
                missing(slot, located);
            }
            slot++;
            count = 0;
        }
        if (slot === slots.length) {
            invalid(located, `${written(child)} is not allowed here in ${written(at.node)}`);
        }
        count++;
        if (child.localName === 'annotation') {
            for (const item of readConstruct(located, annotationGrammar).children) {
                readConstruct(item, appinfoGrammar);
            }
        } else {
            children.push(located);
        }
    }
    for (; slot < slots.length; slot++, count = 0) {
        if (count < (slots[slot]!.min ?? 0)) {
            missing(slot, at);
        }
    }
    return { attributes, children };
};

/**
 * An attribute's value with whitespace collapsed, as every XSD attribute but none of the schema's values has.
 *
 * @param attribute - an attribute of an XSD element
 * @returns its collapsed value
 */
export const collapsed = (attribute: XmlAttributeNode): string =>
    processWhitespace(attribute.value, 'collapse');

/**
 * Reads a required attribute.
 *
 * @param at - its element
 * @param construct - the element, read
 * @param name - name of the attribute it must have
 * @returns the attribute
 * @throws {XeneverInvalidSchemaError} when it is absent
 */
export const required = (at: Located, construct: Construct, name: string): XmlAttributeNode =>
    construct.attributes.get(name) ??
    invalid(at, `${written(at.node)} is missing the attribute \`${name}\``);

/**
 * Reads an NCName attribute, such as a component's `name`.
 *
 * @param at - its element
 * @param attribute - the attribute to read
 * @returns the NCName, whitespace collapsed
 * @throws {XeneverInvalidSchemaError} when it isn't an NCName
 */
export const readNcName = (at: Located, attribute: XmlAttributeNode): string => {
    const value = collapsed(attribute);
    if (!ncNamePattern.test(value)) {
        invalid(at, `${JSON.stringify(value)} is not an NCName`, attribute);
    }
    return value;
};

/**
 * Reads an attribute whose value is one of a few keywords.
 *
 * @param at - its element
 * @param attribute - the attribute, if present
 * @param keywords - the allowed values
 * @returns the value, `undefined` when absent
 * @throws {XeneverInvalidSchemaError} when it isn't one of them
 */
export const readKeyword = <const K extends string>(
    at: Located,
    attribute: XmlAttributeNode | undefined,
    keywords: readonly K[]
): K | undefined => {
    if (attribute === undefined) {
        return undefined;
    }
    const value = collapsed(attribute);
    if (!(keywords as readonly string[]).includes(value)) {
        invalid(at, `${code(attribute.localName)} must be ${codeList(keywords, 'or')}`, attribute);
    }
    return value as K;
};

/**
 * Reads a boolean attribute.
 *
 * @param at - its element
 * @param attribute - the attribute, if present
 * @returns its value, `false` when absent
 * @throws {XeneverInvalidSchemaError} when it isn't an XSD boolean
 */
export const isTrue = (at: Located, attribute: XmlAttributeNode | undefined): boolean => {
    const value = readKeyword(at, attribute, ['true', 'false', '1', '0']);
    return value === 'true' || value === '1';
};

/**
 * Checks a `block`, `final`, `blockDefault` or `finalDefault` attribute, which is accepted and otherwise
 * ignored: without substitution groups or `xsi:type`, no derivation it blocks can be used.
 *
 * @param at - its element
 * @param attribute - the attribute, if present
 * @param keywords - the derivations it may list
 * @throws {XeneverInvalidSchemaError} when it isn't `#all` or a list of them
 */
export const checkDerivationSet = (
    at: Located,
    attribute: XmlAttributeNode | undefined,
    keywords: readonly string[]
): void => {
    if (attribute === undefined) {
        return;
    }
    const value = collapsed(attribute);
    const isValid =
        value === '#all' ||
        (value === '' ? [] : value.split(' ')).every(keyword => keywords.includes(keyword));
    if (!isValid) {
        invalid(
            at,
            `${code(attribute.localName)} must be \`#all\` or a list of ${codeList(keywords, 'and')}`,
            attribute
        );
    }
};

/**
 * A way of deriving a type from another.
 */
export type Derivation = 'extension' | 'list' | 'restriction' | 'union';

/**
 * Whether a global type forbids being derived from in a way: its `final`, or else its file's `finalDefault`,
 * lists the way or is `#all`. A simple type is only ever final for restriction, list and union, which is all
 * its `final` means in XSD 1.0 ([XSD 1.0 Part 1 §3.14.2](https://www.w3.org/TR/xmlschema-1/#Simple_Type_Definition_details)),
 * and a complex type for extension and restriction
 * ([§3.4.2](https://www.w3.org/TR/xmlschema-1/#declare-type)).
 *
 * @param component - the type's `xs:simpleType` or `xs:complexType` element
 * @param derivation - the way
 * @returns whether it forbids it
 */
export const isFinal = (component: Located, derivation: Derivation): boolean => {
    const canBeFinal =
        component.node.localName === 'simpleType'
            ? derivation !== 'extension'
            : derivation === 'extension' || derivation === 'restriction';
    const attribute =
        component.node.attributes.find(
            candidate => candidate.namespace === null && candidate.localName === 'final'
        ) ??
        component.doc.root.attributes.find(
            candidate => candidate.namespace === null && candidate.localName === 'finalDefault'
        );
    if (!canBeFinal || attribute === undefined) {
        return false;
    }
    const value = collapsed(attribute);
    return value === '#all' || value.split(' ').includes(derivation);
};

/**
 * Reads a non-negative integer attribute.
 *
 * @param at - its element
 * @param attribute - the attribute to read
 * @returns its value
 * @throws {XeneverInvalidSchemaError} when it isn't a non-negative integer
 * @throws {XeneverUnsupportedError} when it is past `Number.MAX_SAFE_INTEGER`
 */
export const readCount = (at: Located, attribute: XmlAttributeNode): number => {
    const value = collapsed(attribute);
    if (!/^\+?\d+$/v.test(value)) {
        invalid(at, `\`${attribute.localName}\` must be a non-negative integer`, attribute);
    }
    const count = BigInt(value);
    if (count > BigInt(Number.MAX_SAFE_INTEGER)) {
        unsupported(
            at,
            `\`${attribute.localName}\` past ${Number.MAX_SAFE_INTEGER} is not supported`,
            attribute
        );
    }
    return Number(count);
};

/**
 * A particle's occurrences, as the IR writes them: absent when 1.
 */
export interface ReadOccurs {
    readonly minOccurs?: number;
    readonly maxOccurs?: 'unbounded' | number;
}

/**
 * Reads `minOccurs` and `maxOccurs`.
 *
 * @param at - the particle
 * @param construct - the particle, read
 * @returns the occurrences, or `null` when `maxOccurs` is 0, so the particle can never occur
 * @throws {XeneverInvalidSchemaError} when they aren't valid bounds
 */
export const readOccurs = (at: Located, construct: Construct): ReadOccurs | null => {
    const minAttribute = construct.attributes.get('minOccurs');
    const maxAttribute = construct.attributes.get('maxOccurs');
    const min = minAttribute === undefined ? 1 : readCount(at, minAttribute);
    let max: 'unbounded' | number = 1;
    if (maxAttribute !== undefined) {
        max = collapsed(maxAttribute) === 'unbounded' ? 'unbounded' : readCount(at, maxAttribute);
    }
    if (max !== 'unbounded' && max < min) {
        invalid(at, '`maxOccurs` is less than `minOccurs`', maxAttribute);
    }
    return max === 0
        ? null
        : { ...(min !== 1 && { minOccurs: min }), ...(max !== 1 && { maxOccurs: max }) };
};

/**
 * A QName, resolved.
 */
export interface ResolvedName {
    readonly namespace: string | null;
    readonly localName: string;
}

/**
 * Resolves a QName written in an XSD, such as a `type` or `ref`, against the namespaces in scope at its
 * element: an unprefixed name takes the default namespace. The namespace must be one the file may refer to.
 *
 * @param at - the element it is written on
 * @param attribute - the attribute it is written in
 * @param text - the QName, when the attribute holds a list of them
 * @returns the namespace name and local name
 * @throws {XeneverInvalidSchemaError} when it isn't a QName, its prefix isn't declared, or the file doesn't
 * import its namespace
 */
export const resolveQName = (
    at: Located,
    attribute: XmlAttributeNode,
    text = collapsed(attribute)
): ResolvedName => {
    const colon = text.indexOf(':');
    const prefix = colon === -1 ? '' : text.slice(0, colon);
    const localName = text.slice(colon + 1);
    if ((colon !== -1 && !ncNamePattern.test(prefix)) || !ncNamePattern.test(localName)) {
        invalid(at, `${JSON.stringify(text)} is not a QName`, attribute);
    }
    const namespace = at.node.inScopeNamespaces.get(prefix) ?? null;
    if (colon !== -1 && namespace === null) {
        invalid(at, `The prefix of ${JSON.stringify(text)} is not declared`, attribute);
    }
    if (namespace !== xsdNamespace && !at.doc.references.has(namespace)) {
        invalid(
            at,
            `${JSON.stringify(text)} is in ${namespace === null ? 'no namespace' : code(namespace)}, which this schema neither targets nor imports`,
            attribute
        );
    }
    return { namespace, localName };
};
