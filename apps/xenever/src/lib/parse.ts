import type { XeneverInvalidSchemaError, XeneverXmlError, XmlErrorLocation } from './errors.js';
import type {
    CompiledAttribute,
    CompiledComplex,
    CompiledElement,
    CompiledType,
    CompiledWildcard,
    FixedValue,
} from './schema/compile.js';
import type { Infer, QNameValue, XmlAttribute, XmlNode } from './schema/infer.js';
import type { Element, ProcessContents } from './schema/ir.js';
import type { CompiledSimple } from './simple/compile-simple.js';
import type { StandardSchemaV1 } from './standard-schema.js';
import type { XmlAttributeNode, XmlElementNode } from './xml/nodes.js';
import { XeneverDocumentError, XeneverUnsupportedError, XeneverValidationError } from './errors.js';
import { IdentityScope } from './identity.js';
import { anyKey, compileRoot, describeName, expandedName } from './schema/compile.js';
import { expectedLabels, matchingWildcards } from './schema/content.js';
import { InvalidValueError } from './simple/builtins.js';
import { compileSimple } from './simple/compile-simple.js';
import { at, written } from './xml/nodes.js';
import { readXml } from './xml/read-xml.js';

/**
 * Namespace name of the `xsi` attributes ([XSD 1.1 Part 1 §2.7](https://www.w3.org/TR/xmlschema11-1/#xsi-attr)).
 */
const xsiNamespace = 'http://www.w3.org/2001/XMLSchema-instance';

/**
 * Namespace name of XML Schema's built-in types.
 */
const xsdNamespace = 'http://www.w3.org/2001/XMLSchema';

/**
 * `xsi` attributes `readAttributes` skips: hints for finding a schema, `nil`, which `isNil` reads, and `type`,
 * which `selectType` reads.
 */
const xsiAttributes: ReadonlySet<string> = new Set([
    'schemaLocation',
    'noNamespaceSchemaLocation',
    'nil',
    'type',
]);

/**
 * Types of `xsi:nil` and `xsi:type`.
 */
const nilType = compileSimple({ kind: 'boolean' }, '/');
const typeNameType = compileSimple({ kind: 'QName' }, '/');

/**
 * Key of text entries in ordered `children`.
 */
const textKey = '#text';

/**
 * Whitespace as XML defines it ([XML 1.0 §2.3](https://www.w3.org/TR/xml/#NT-S)).
 */
const whitespaceOnly = /^[\t\n\r ]*$/v;

/**
 * Lists labels for an error: `` `a`, `b` or `c` ``.
 *
 * @param labels - what to list
 * @returns them in one phrase
 */
const listLabels = (labels: readonly string[]): string =>
    labels.length === 1 ? labels[0]! : `${labels.slice(0, -1).join(', ')} or ${labels.at(-1)!}`;

/**
 * Reads the text of an element with a simple type, or with text content.
 *
 * @param node - node of the XML tree
 * @returns its text
 * @throws {XeneverValidationError} when it has a child element
 */
const textOf = (node: XmlElementNode): string => {
    let text = '';
    for (const child of node.children) {
        if (child.kind === 'element') {
            throw new XeneverValidationError(
                `Element ${written(child)} is not allowed: ${written(node)} has text content only`,
                at(child)
            );
        }
        text += child.text;
    }
    return text;
};

/**
 * The `ID`s and `IDREF`s of one document: each `ID` is bound to one element, and each `IDREF` must name an
 * `ID` somewhere in the document ([XSD 1.1 Part 1 §3.17.5.2](https://www.w3.org/TR/xmlschema11-1/#cvc-id)).
 * An element may have one `ID` more than once (two `ID` attributes with one value), as XSD 1.1 allows.
 */
class IdTable {
    readonly #bound = new Map<string, XmlElementNode>();
    readonly #references: { readonly id: string; readonly location: XmlErrorLocation }[] = [];

    /**
     * Records the `ID`s and `IDREF`s of a value.
     *
     * @param found - each `ID` and `IDREF` of the value
     * @param element - the element the value is the text or an attribute of, to which an `ID` is bound
     * @param location - where the value is written
     * @throws {XeneverValidationError} when an `ID` is already bound to another element
     */
    public add(
        found: readonly (readonly [kind: 'ID' | 'IDREF', id: string])[],
        element: XmlElementNode,
        location: XmlErrorLocation
    ): void {
        for (const [kind, id] of found) {
            if (kind === 'IDREF') {
                this.#references.push({ id, location });
                continue;
            }
            const bound = this.#bound.get(id);
            if (bound !== undefined && bound !== element) {
                throw new XeneverValidationError(
                    `ID ${JSON.stringify(id)} is already the ID of \`${bound.path}\``,
                    location
                );
            }
            this.#bound.set(id, element);
        }
    }

    /**
     * Checks every `IDREF` names an `ID`, once the whole document is read.
     *
     * @throws {XeneverValidationError} at the first `IDREF`, in document order, that names no `ID`
     */
    public checkReferences(): void {
        for (const { id, location } of this.#references) {
            if (!this.#bound.has(id)) {
                throw new XeneverValidationError(
                    `IDREF ${JSON.stringify(id)} is not the ID of any element in the document`,
                    location
                );
            }
        }
    }
}

/**
 * What reading one document keeps track of: its `ID`s and `IDREF`s, and the identity constraints being
 * checked, `null` outside any element that has some.
 */
interface DocumentState {
    readonly ids: IdTable;
    identity: IdentityScope | null;
}

/**
 * Reads a simple value, rethrowing an invalid value where it was written, and records its `ID`s and
 * `IDREF`s.
 *
 * @param type - its simple type
 * @param text - as written
 * @param node - the element whose text or attribute it is
 * @param location - where the text is
 * @param ids - the document's `ID`s and `IDREF`s, or `null` for a value that has none (`xsi:nil`)
 * @param namespaces - namespaces a `QName` in it resolves against: those in scope at the element, or those of
 * the declaration for its `default` or `fixed`
 * @returns its value
 * @throws {XeneverValidationError} when the text isn't valid, or holds an `ID` another element has
 */
const readValue = (
    type: CompiledSimple,
    text: string,
    node: XmlElementNode,
    location: XmlErrorLocation,
    ids: IdTable | null,
    namespaces: ReadonlyMap<string, string> = node.inScopeNamespaces
): unknown => {
    const found: [kind: 'ID' | 'IDREF', id: string][] = [];
    let value: unknown;
    try {
        value = type.parse(
            text,
            namespaces,
            ids && type.hasIds
                ? (kind, id) => {
                      found.push([kind, id]);
                  }
                : undefined
        );
    } catch (error) {
        // Unreachable: reading a value throws only invalid values.
        /* c8 ignore next 3 */
        if (!(error instanceof InvalidValueError)) {
            throw error;
        }
        throw new XeneverValidationError(error.message, { ...location, cause: error });
    }
    ids?.add(found, node, location);
    return value;
};

/**
 * An attribute a wildcard allowed, as written.
 *
 * @param attribute - attribute of the XML tree
 * @returns its public shape
 */
const toXmlAttribute = ({ namespace, localName, value }: XmlAttributeNode): XmlAttribute => ({
    namespace,
    localName,
    value,
});

/**
 * Public form of each in-scope namespace map, so elements that share a map (those declaring no namespaces)
 * share one object.
 */
const namespaceRecords = new WeakMap<
    ReadonlyMap<string, string>,
    Readonly<Record<string, string>>
>();

/**
 * Public form of an in-scope namespace map.
 *
 * @param namespaces - prefix to namespace name
 * @returns the same, as a frozen plain object
 */
const toNamespaceRecord = (
    namespaces: ReadonlyMap<string, string>
): Readonly<Record<string, string>> => {
    let record = namespaceRecords.get(namespaces);
    if (!record) {
        record = Object.freeze(Object.fromEntries(namespaces));
        namespaceRecords.set(namespaces, record);
    }
    return record;
};

/**
 * An element a wildcard allowed, as written.
 *
 * @param node - node of the XML tree
 * @returns its public shape, children included
 */
const toXmlNode = (node: XmlElementNode): XmlNode => ({
    kind: 'element',
    namespace: node.namespace,
    localName: node.localName,
    attributes: node.attributes.map(attribute => toXmlAttribute(attribute)),
    children: node.children.map(child =>
        child.kind === 'text' ? { kind: 'text', text: child.text } : toXmlNode(child)
    ),
    inScopeNamespaces: toNamespaceRecord(node.inScopeNamespaces),
});

/**
 * Reads an attribute's value as its declaration says.
 *
 * @param attribute - attribute of the XML tree
 * @param declaration - what declares it
 * @param node - its element
 * @param ids - the document's `ID`s and `IDREF`s
 * @returns its value
 * @throws {XeneverValidationError} when it isn't valid, or isn't the fixed value
 */
const readAttribute = (
    attribute: XmlAttributeNode,
    declaration: CompiledAttribute,
    node: XmlElementNode,
    ids: IdTable
): unknown => {
    const value = readValue(declaration.type, attribute.value, node, at(attribute), ids);
    if (declaration.fixed && !declaration.type.isEqual(value, declaration.fixed.value)) {
        throw new XeneverValidationError(
            `Attribute ${written(attribute)} must be ${JSON.stringify(declaration.fixed.lexical)}`,
            at(attribute)
        );
    }
    return value;
};

/**
 * Validates an attribute an attribute wildcard allowed, as its `processContents` says
 * ([XSD 1.0 Part 1 §3.10.4](https://www.w3.org/TR/xmlschema-1/#cvc-wildcard)).
 *
 * @param attribute - attribute of the XML tree
 * @param wildcard - the attribute wildcard that allowed it
 * @param node - its element
 * @param ids - the document's `ID`s and `IDREF`s
 * @throws {XeneverValidationError} when it isn't valid for its declaration, or a strict wildcard has none
 */
const checkWildcardAttribute = (
    attribute: XmlAttributeNode,
    wildcard: CompiledWildcard<CompiledAttribute>,
    node: XmlElementNode,
    ids: IdTable
): void => {
    if (wildcard.processContents === 'skip') {
        return;
    }
    const declaration = wildcard.declarations.get(
        expandedName(attribute.namespace, attribute.localName)
    );
    if (declaration) {
        readAttribute(attribute, declaration, node, ids);
    } else if (wildcard.processContents === 'strict') {
        throw new XeneverValidationError(
            `Attribute ${written(attribute)} is not declared, which the strict attribute wildcard of ${written(node)} needs`,
            at(attribute)
        );
    }
};

/**
 * Reads an element's attributes.
 *
 * @param node - node of the XML tree
 * @param type - its complex type, or `null` for a simple type, which has no attributes
 * @param ids - the document's `ID`s and `IDREF`s
 * @returns the value of `attributes`, keys in declaration order, then `#any`
 * @throws {XeneverValidationError} when an attribute isn't allowed or valid, or a required one is missing
 */
const readAttributes = (
    node: XmlElementNode,
    type: CompiledComplex | null,
    ids: IdTable
): Record<string, unknown> => {
    const values = new Map<string, unknown>();
    const wildcardMatches: XmlAttribute[] = [];
    for (const attribute of node.attributes) {
        // Hints for finding a schema, which `parse` is already given, and `nil`, which `readElement` read.
        if (attribute.namespace === xsiNamespace && xsiAttributes.has(attribute.localName)) {
            continue;
        }
        const declaration = type?.attributes.get(
            expandedName(attribute.namespace, attribute.localName)
        );
        if (declaration) {
            values.set(declaration.key, readAttribute(attribute, declaration, node, ids));
        } else if (type?.anyAttribute?.allows(attribute.namespace) === true) {
            checkWildcardAttribute(attribute, type.anyAttribute, node, ids);
            wildcardMatches.push(toXmlAttribute(attribute));
        } else {
            throw new XeneverValidationError(
                `Attribute ${written(attribute)} is not declared on ${written(node)}`,
                at(attribute)
            );
        }
    }
    const attributes: Record<string, unknown> = {};
    if (!type) {
        return attributes;
    }
    for (const declaration of type.attributes.values()) {
        if (values.has(declaration.key)) {
            attributes[declaration.key] = values.get(declaration.key);
        } else if (declaration.required) {
            // Even with a `fixed` value, which only fills in an optional attribute
            // ([XSD 1.0 Part 1 §3.4.4](https://www.w3.org/TR/xmlschema-1/#cvc-complex-type), clause 4).
            throw new XeneverValidationError(
                `Element ${written(node)} is missing attribute ${describeName(declaration.namespace, declaration.name)}`,
                at(node)
            );
        } else if (declaration.absent !== null) {
            // A default `IDREF` still needs its `ID`.
            attributes[declaration.key] = readValue(
                declaration.type,
                declaration.absent,
                node,
                at(node),
                ids,
                declaration.absentNamespaces
            );
        }
    }
    if (wildcardMatches.length > 0) {
        attributes[anyKey] = wildcardMatches;
    }
    return attributes;
};

/**
 * The `xsi:type` attribute of an element.
 *
 * @param node - node of the XML tree
 * @returns the attribute, if it has one
 */
const xsiTypeOf = (node: XmlElementNode): XmlAttributeNode | undefined =>
    node.attributes.find(
        attribute => attribute.namespace === xsiNamespace && attribute.localName === 'type'
    );

/**
 * Throws that an `xsi:type` is one xenever doesn't support.
 *
 * @param xsiType - the attribute
 * @param where - which elements it isn't supported on
 * @throws {XeneverUnsupportedError} always
 */
const unsupportedXsiType = (xsiType: XmlAttributeNode, where: string): never => {
    throw new XeneverUnsupportedError(
        `\`xsi:type\` on ${where} is not supported (line ${xsiType.location.line}, column ${xsiType.location.column})`,
        { path: xsiType.path }
    );
};

/**
 * The type an element's `xsi:type` selects, before anything else about the element is read: it decides what is
 * valid ([XSD 1.0 Part 1 §3.3.4](https://www.w3.org/TR/xmlschema-1/#cvc-elt), clause 4). It may name the
 * declared type, or one of the declaration's `types`.
 *
 * @param node - node of the XML tree
 * @param xsiType - its `xsi:type` attribute
 * @param declaration - what declares it
 * @returns the type to read the element as
 * @throws {XeneverValidationError} when it isn't a QName, or names a type the declaration doesn't allow
 * @throws {XeneverUnsupportedError} on an element of a simple type, and when it names another type on an
 * element of `xs:anyType`, which every type derives from
 */
const selectType = (
    node: XmlElementNode,
    xsiType: XmlAttributeNode,
    declaration: CompiledElement
): CompiledComplex => {
    const { type } = declaration;
    if (type.kind === 'simple') {
        return unsupportedXsiType(xsiType, 'an element of a simple type');
    }
    const { namespace, localName } = readValue(
        typeNameType,
        xsiType.value,
        node,
        at(xsiType),
        null
    ) as QNameValue;
    if (type.name === localName && type.namespace === namespace) {
        return type;
    }
    const selected = declaration.types?.get(expandedName(namespace, localName));
    if (selected) {
        return selected;
    }
    if (type.name === 'anyType' && type.namespace === xsdNamespace) {
        return unsupportedXsiType(xsiType, 'an element of `xs:anyType`');
    }
    throw new XeneverValidationError(
        `\`xsi:type\` names ${describeName(namespace, localName)}, which is not a type ${written(node)} may have`,
        at(xsiType)
    );
};

/**
 * How strong each `processContents` is, to pick the strongest of several wildcards.
 */
const processStrength: Readonly<Record<ProcessContents, number>> = { skip: 0, lax: 1, strict: 2 };

/**
 * Validates an element a wildcard matched, as its `processContents` says
 * ([XSD 1.0 Part 1 §3.10.4](https://www.w3.org/TR/xmlschema-1/#cvc-wildcard)). When several wildcards may have
 * matched it (a model breaking Unique Particle Attribution), the strongest `processContents` applies, and the
 * first declaration of its name.
 *
 * @param child - node of the XML tree
 * @param wildcards - the wildcards that may have matched it, in model order
 * @param state - what reading the document keeps track of
 * @throws {XeneverValidationError} when it isn't valid for its declaration, or a strict wildcard has none
 * @throws {XeneverUnsupportedError} on `xsi:type` where the element has no declaration and isn't skipped
 */
const checkWildcardElement = (
    child: XmlElementNode,
    wildcards: readonly CompiledWildcard<CompiledElement>[],
    state: DocumentState
): void => {
    let processContents: ProcessContents = 'skip';
    for (const wildcard of wildcards) {
        if (processStrength[wildcard.processContents] > processStrength[processContents]) {
            ({ processContents } = wildcard);
        }
    }
    if (processContents === 'skip') {
        return;
    }
    const name = expandedName(child.namespace, child.localName);
    const declaration = wildcards
        .values()
        .map(wildcard => wildcard.declarations.get(name))
        .find(found => found !== undefined);
    if (declaration) {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define -- `readElement` and this function call each other
        readElement(child, declaration, state);
        return;
    }
    // Without a declaration, `xsi:type` would give the type to validate against.
    const xsiType = xsiTypeOf(child);
    if (xsiType) {
        unsupportedXsiType(xsiType, 'an element a wildcard matched that has no declaration');
    }
    if (processContents === 'strict') {
        throw new XeneverValidationError(
            `Element ${written(child)} is not declared, which the strict wildcard matching it needs`,
            at(child)
        );
    }
};

/**
 * Reads the child elements of an element with content, and its text when mixed.
 *
 * @param node - node of the XML tree
 * @param type - its complex type, which has content
 * @param state - what reading the document keeps track of
 * @returns the value of `children`: an object by key, or entries in document order when ordered
 * @throws {XeneverValidationError} when the children don't match the content model
 */
const readChildren = (
    node: XmlElementNode,
    type: CompiledComplex,
    state: DocumentState
): unknown => {
    const { model, elements, keys, wildcards } = type.content!;
    const values = new Map<string, unknown[]>();
    const entries: { readonly name: string; readonly value: unknown }[] = [];
    const add = (key: string, value: unknown): void => {
        if (type.ordered) {
            entries.push({ name: key, value });
            return;
        }
        let list = values.get(key);
        if (!list) {
            list = [];
            values.set(key, list);
        }
        list.push(value);
    };
    let term = model.start;
    for (const child of node.children) {
        if (child.kind === 'text') {
            if (type.mixed) {
                add(textKey, child.text);
            } else if (!whitespaceOnly.test(child.text)) {
                // Whitespace between elements is formatting; any other text has nowhere to go.
                throw new XeneverValidationError(
                    `Text is not allowed in ${written(node)}, which has element-only content`,
                    { ...child.location, path: node.path }
                );
            }
            continue;
        }
        const { namespace } = child;
        const name = expandedName(namespace, child.localName);
        const next = model.derive(term, { name, namespace });
        if (model.isFailed(next.term)) {
            const expected = [
                ...expectedLabels(term),
                ...(term.nullable ? [`the end of ${written(node)}`] : []),
            ];
            const hint = expected.length === 0 ? '' : `; expected ${listLabels(expected)}`;
            throw new XeneverValidationError(
                `Element ${written(child)} is not expected here${hint}`,
                at(child)
            );
        }
        const before = term;
        ({ term } = next);
        if (next.isWildcard) {
            checkWildcardElement(
                child,
                matchingWildcards(before, { name, namespace }).map(
                    symbol => wildcards.get(symbol.id)!
                ),
                state
            );
            add(anyKey, toXmlNode(child));
        } else {
            const declaration = elements.get(name)!;
            // eslint-disable-next-line @typescript-eslint/no-use-before-define -- `readElement` and this function call each other
            add(declaration.key, readElement(child, declaration, state));
        }
    }
    if (!term.nullable) {
        const expected = expectedLabels(term);
        throw new XeneverValidationError(
            expected.length === 0
                ? `Element ${written(node)} can not be valid: its content needs an element that can never occur`
                : `Element ${written(node)} is missing ${listLabels(expected)}`,
            at(node)
        );
    }
    if (type.ordered) {
        return entries;
    }
    const children: Record<string, unknown> = {};
    for (const { key, array } of keys) {
        const list = values.get(key);
        if (list) {
            children[key] = array ? list : list[0];
        }
    }
    return children;
};

/**
 * Reads `xsi:nil`.
 *
 * @param node - node of the XML tree
 * @param declaration - what declares it
 * @returns whether the element is nil
 * @throws {XeneverValidationError} when `xsi:nil` isn't allowed or isn't a boolean, or a nil element isn't
 * empty or has a `fixed` value
 */
const isNil = (node: XmlElementNode, declaration: CompiledElement): boolean => {
    const nil = node.attributes.find(
        attribute => attribute.namespace === xsiNamespace && attribute.localName === 'nil'
    );
    if (!nil) {
        return false;
    }
    if (!declaration.nillable) {
        // Cvc-elt.3.1: only a nillable element may have xsi:nil, whatever its value.
        throw new XeneverValidationError(
            `Element ${written(node)} is not nillable, so must not have \`xsi:nil\``,
            at(nil)
        );
    }
    const isTrue = readValue(nilType, nil.value, node, at(nil), null);
    if (isTrue === false) {
        return false;
    }
    const [first] = node.children;
    if (first) {
        // Cvc-elt.3.2.1: a nil element has no text or children.
        throw new XeneverValidationError(
            `Element ${written(node)} is \`xsi:nil\`, so must be empty`,
            first.kind === 'element' ? at(first) : { ...first.location, path: node.path }
        );
    }
    if (declaration.fixed) {
        // Cvc-elt.3.2.2: a fixed value can't be nil.
        throw new XeneverValidationError(
            `Element ${written(node)} has a fixed value, so must not be \`xsi:nil\``,
            at(nil)
        );
    }
    return true;
};

/**
 * Reads the text of an element with a simple type or text content, checking a `fixed` value: an empty
 * element reads as its `default` or `fixed` text, a `QName` in it resolved against the declaration's
 * `namespaces`.
 *
 * @param node - node of the XML tree
 * @param declaration - what declares it
 * @param type - its simple type, or the type of its text
 * @param fixed - the declaration's `fixed` value as `type` reads it, `null` when it has none or it isn't valid
 * for `type`, which no value then matches
 * @param ids - the document's `ID`s and `IDREF`s
 * @returns the value
 * @throws {XeneverValidationError} when the text isn't valid, or isn't the fixed value
 */
const readText = (
    node: XmlElementNode,
    declaration: CompiledElement,
    type: CompiledSimple,
    fixed: FixedValue | null,
    ids: IdTable
): unknown => {
    const isFilled = declaration.empty !== null && node.children.length === 0;
    const value = isFilled
        ? readValue(type, declaration.empty, node, at(node), ids, declaration.emptyNamespaces)
        : readValue(type, textOf(node), node, at(node), ids);
    if (declaration.fixed && (fixed === null || !type.isEqual(value, fixed.value))) {
        throw new XeneverValidationError(
            `Element ${written(node)} must be ${JSON.stringify(declaration.fixed.lexical)}`,
            at(node)
        );
    }
    return value;
};

/**
 * An element of a complex type without text as it is validated: an empty one holds its `default` or `fixed`
 * text, checked against the type it is read as
 * ([XSD 1.0 Part 1 §3.3.4](https://www.w3.org/TR/xmlschema-1/#cvc-elt), clause 5.1.2), so mixed content reads
 * it as one text. `readText` fills in the text of the other types itself, as it reads the value against the
 * namespaces the declaration gives it.
 *
 * @param node - node of the XML tree
 * @param declaration - what declares it
 * @returns the node, with the text as its child when it is empty and the declaration has a non-empty one
 */
const withFallback = (node: XmlElementNode, declaration: CompiledElement): XmlElementNode =>
    declaration.empty === null || declaration.empty === '' || node.children.length > 0
        ? node
        : {
              ...node,
              children: [{ kind: 'text', text: declaration.empty, location: node.location }],
          };

/**
 * Checks the content of an element with content against its declaration's `fixed` value: it has no child
 * elements, and with mixed content its text is the value as written, not compared as a value
 * ([XSD 1.0 Part 1 §3.3.4](https://www.w3.org/TR/xmlschema-1/#cvc-elt), clause 5.2.2). Element-only content
 * compares no text, as all it may hold is whitespace.
 *
 * @param node - node of the XML tree, with its `fixed` text when empty (see {@link withFallback})
 * @param type - its complex type, which has content
 * @param fixed - the declaration's `fixed` value
 * @throws {XeneverValidationError} when it has a child element, or mixed content with other text
 */
const checkContentFixed = (
    node: XmlElementNode,
    type: CompiledComplex,
    fixed: FixedValue
): void => {
    let text = '';
    for (const child of node.children) {
        if (child.kind === 'element') {
            throw new XeneverValidationError(
                `Element ${written(child)} is not allowed: ${written(node)} has a fixed value`,
                at(child)
            );
        }
        text += child.text;
    }
    if (type.mixed && text !== fixed.lexical) {
        throw new XeneverValidationError(
            `Element ${written(node)} must be ${JSON.stringify(fixed.lexical)}`,
            at(node)
        );
    }
};

/**
 * Reads an element as its declaration says, without its identity constraints.
 *
 * @param node - node of the XML tree
 * @param declaration - what declares it
 * @param state - what reading the document keeps track of
 * @returns its value
 * @throws {XeneverValidationError} when it doesn't match the declaration
 * @throws {XeneverUnsupportedError} on an `xsi:type` xenever doesn't support
 */
const readDeclared = (
    node: XmlElementNode,
    declaration: CompiledElement,
    state: DocumentState
): unknown => {
    if (declaration.abstract) {
        // Cvc-elt.2: reached as the root, or through a wildcard, as no content model matches one.
        throw new XeneverValidationError(
            `Element ${written(node)} is abstract, so can not be in a document`,
            at(node)
        );
    }
    const xsiType = xsiTypeOf(node);
    const type: CompiledType = xsiType ? selectType(node, xsiType, declaration) : declaration.type;
    if (type.kind === 'complex' && type.abstract) {
        // Cvc-type.2: also when `xsi:type` names the declared type itself, or the element is nil.
        throw new XeneverValidationError(
            xsiType
                ? `\`xsi:type\` names the type of ${written(node)}, which is abstract`
                : `The type of ${written(node)} is abstract, so it needs an \`xsi:type\` naming the type it has`,
            at(xsiType ?? node)
        );
    }
    const { ids } = state;
    const complex = type.kind === 'complex' ? type : null;
    const isNilled = isNil(node, declaration);
    state.identity?.record(node, declaration, type, isNilled);
    if (isNilled) {
        // Validated, but a nil element's value is `null` alone.
        readAttributes(node, complex, ids);
        return null;
    }
    if (type.kind === 'simple') {
        readAttributes(node, null, ids);
        return readText(node, declaration, type.simple, declaration.fixed, ids);
    }
    const attributes = readAttributes(node, type, ids);
    // An element that `xsi:type` may select the type of says which it was read as.
    const value: Record<string, unknown> = declaration.types
        ? { type: type.key, attributes }
        : { attributes };
    const content = withFallback(node, declaration);
    if (type.content) {
        if (declaration.fixed) {
            checkContentFixed(content, type, declaration.fixed);
        }
        value.children = readChildren(content, type, state);
    } else if (type.text) {
        // Compared in the value space of the type the element was read as, as `xsi:type` may select another.
        value.text = readText(
            node,
            declaration,
            type.text,
            type === declaration.type
                ? declaration.fixed
                : (declaration.typesFixed?.get(type) ?? null),
            ids
        );
    } else {
        // Cvc-complex-type.2.1: empty content allows no children at all, not even whitespace.
        const [first] = content.children;
        if (first) {
            throw new XeneverValidationError(
                `${written(node)} must be empty`,
                first.kind === 'element' ? at(first) : { ...first.location, path: node.path }
            );
        }
    }
    return value;
};

/**
 * Reads an element as its declaration says, then checks its identity constraints over its subtree. Elements
 * outside any element with identity constraints skip the bookkeeping.
 *
 * @param node - node of the XML tree
 * @param declaration - what declares it
 * @param state - what reading the document keeps track of
 * @returns its value
 * @throws {XeneverValidationError} when it doesn't match the declaration, or breaks an identity constraint
 * @throws {XeneverUnsupportedError} on an `xsi:type` xenever doesn't support
 */
const readElement = (
    node: XmlElementNode,
    declaration: CompiledElement,
    state: DocumentState
): unknown => {
    if (declaration.identity === null && state.identity === null) {
        return readDeclared(node, declaration, state);
    }
    state.identity ??= new IdentityScope();
    const scope = state.identity;
    const siblings = scope.enter(declaration);
    const value = readDeclared(node, declaration, state);
    scope.exit(node, declaration, siblings);
    if (scope.isDone) {
        state.identity = null;
    }
    return value;
};

/**
 * Reads a document whose root the compiled declaration declares.
 *
 * @param xml - XML text
 * @param root - what declares the root element
 * @returns the root's value
 * @throws {XeneverXmlError} when the document is not namespace-well-formed XML
 * @throws {XeneverValidationError} when the document doesn't match the declaration, or an `ID` is not
 * unique, or an `IDREF` names no `ID`
 */
const readDocument = (xml: string, root: CompiledElement): unknown => {
    const node = readXml(xml);
    if (node.namespace !== root.namespace || node.localName !== root.name) {
        throw new XeneverValidationError(
            `Expected the root element ${describeName(root.namespace, root.name)}, not ${describeName(node.namespace, node.localName)}`,
            at(node)
        );
    }
    const state: DocumentState = { ids: new IdTable(), identity: null };
    const value = readElement(node, root, state);
    state.ids.checkReferences();
    return value;
};

/**
 * Parses an XML document, validated against an element declaration as its root. The first problem found
 * throws: a {@link XeneverXmlError} or {@link XeneverValidationError} with its location in the document, or a
 * {@link XeneverInvalidSchemaError} with its path in the declaration.
 *
 * @param xml - XML text
 * @param element - declaration of its root element (its `minOccurs` and `maxOccurs` are ignored)
 * @returns the root's value, shaped by the declaration
 * @throws {XeneverXmlError} when the document is not namespace-well-formed XML, or has a DOCTYPE
 * @throws {XeneverValidationError} when the document doesn't match the declaration
 * @throws {XeneverInvalidSchemaError} when the declaration is not a valid schema value
 * @throws {XeneverUnsupportedError} when the declaration or the document uses something xenever doesn't
 * support, such as `xsi:type` on an element of a simple type
 */
export const parse = <const E extends Element>(xml: string, element: E): Infer<E> =>
    readDocument(xml, compileRoot(element)) as Infer<E>;

/**
 * Standard Schema issue path of a document path: its steps, `/order/item[2]/@sku` as
 * `['order', 'item[2]', '@sku']`.
 *
 * @param path - document path
 * @returns its steps, or `undefined` for the document itself
 */
const issuePath = (path: string): readonly string[] | undefined =>
    path === '/' ? undefined : path.slice(1).split('/');

/**
 * Standard Schema properties of an element declaration: `validate` parses an XML string with it as the root.
 * The schema value's own errors still throw; the document's are returned as issues.
 *
 * @param element - the declaration
 * @returns the `'~standard'` properties
 */
export const standardProps = <E extends Element>(
    element: E
): StandardSchemaV1.Props<string, Infer<E>> => ({
    version: 1,
    vendor: 'xenever',
    validate: (value: unknown): StandardSchemaV1.Result<Infer<E>> => {
        if (typeof value !== 'string') {
            return { issues: [{ message: 'Expected an XML string' }] };
        }
        const root = compileRoot(element);
        try {
            return { value: readDocument(value, root) as Infer<E> };
        } catch (error) {
            const isIssue =
                error instanceof XeneverDocumentError || error instanceof XeneverUnsupportedError;
            // Unreachable: anything else is a bug, not an issue with the document.
            /* c8 ignore next 3 */
            if (!isIssue) {
                throw error;
            }
            return { issues: [{ message: error.message, path: issuePath(error.path) }] };
        }
    },
});
