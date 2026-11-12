import type { XeneverInvalidSchemaError, XeneverXmlError, XmlErrorLocation } from './errors.js';
import type { CompiledComplex, CompiledElement } from './schema/compile.js';
import type { Infer } from './schema/infer.js';
import type { Element } from './schema/ir.js';
import type { StandardSchemaV1 } from './standard-schema.js';
import type { XmlElementNode } from './xml/nodes.js';
import { XeneverDocumentError, XeneverUnsupportedError, XeneverValidationError } from './errors.js';
import { compileElement, describeName, expandedName } from './schema/compile.js';
import { expectedLabels } from './schema/content.js';
import { InvalidValueError } from './simple/builtins.js';
import { readXml } from './xml/read-xml.js';

/**
 * Namespace name of the `xsi` attributes ([XSD 1.1 Part 1 §2.7](https://www.w3.org/TR/xmlschema11-1/#xsi-attr)).
 */
const xsiNamespace = 'http://www.w3.org/2001/XMLSchema-instance';

/**
 * Whitespace as XML defines it ([XML 1.0 §2.3](https://www.w3.org/TR/xml/#NT-S)).
 */
const whitespaceOnly = /^[\t\n\r ]*$/v;

/**
 * Where an element or attribute is, for errors.
 *
 * @param node - element or attribute read
 * @returns its location and path
 */
const at = (node: Pick<XmlElementNode, 'location' | 'path'>): XmlErrorLocation => ({
    ...node.location,
    path: node.path,
});

/**
 * Name of an element or attribute as written, for errors.
 *
 * @param node - element or attribute read
 * @returns its name, prefix included
 */
const written = (node: Pick<XmlElementNode, 'localName' | 'prefix'>): string => {
    const name = node.prefix === null ? node.localName : `${node.prefix}:${node.localName}`;
    return `\`${name}\``;
};

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
 * Reads a simple value, rethrowing an invalid value where it was written.
 *
 * @param read - reads the value
 * @param location - where the text is
 * @returns what `read` returns
 * @throws {XeneverValidationError} when the text isn't valid
 */
const readValue = (read: () => unknown, location: XmlErrorLocation): unknown => {
    try {
        return read();
    } catch (error) {
        // Unreachable: reading a value throws only invalid values.
        /* c8 ignore next 3 */
        if (!(error instanceof InvalidValueError)) {
            throw error;
        }
        throw new XeneverValidationError(error.message, { ...location, cause: error });
    }
};

/**
 * Reads an element's attributes.
 *
 * @param node - node of the XML tree
 * @param type - its complex type, or `null` for a simple type, which has no attributes
 * @returns the value of `attributes`, keys in declaration order
 * @throws {XeneverValidationError} when an attribute isn't declared or valid, or a required one is missing
 * @throws {XeneverUnsupportedError} on `xsi:type`
 */
const readAttributes = (
    node: XmlElementNode,
    type: CompiledComplex | null
): Record<string, unknown> => {
    const values = new Map<string, unknown>();
    for (const attribute of node.attributes) {
        if (attribute.namespace === xsiNamespace) {
            if (attribute.localName === 'type') {
                // Polymorphism, which xsi:type selects, is for a later version.
                throw new XeneverUnsupportedError(
                    `\`xsi:type\` is not supported (line ${attribute.location.line}, column ${attribute.location.column})`,
                    { path: attribute.path }
                );
            }
            // Hints for finding a schema, which `parse` is already given.
            if (
                attribute.localName === 'schemaLocation' ||
                attribute.localName === 'noNamespaceSchemaLocation'
            ) {
                continue;
            }
            if (attribute.localName === 'nil') {
                // Cvc-elt.3.1: only a nillable element may have xsi:nil, whatever its value.
                throw new XeneverValidationError(
                    `Element ${written(node)} is not nillable, so must not have \`xsi:nil\``,
                    at(attribute)
                );
            }
        }
        const declaration = type?.attributes.get(
            expandedName(attribute.namespace, attribute.localName)
        );
        if (!declaration) {
            throw new XeneverValidationError(
                `Attribute ${written(attribute)} is not declared on ${written(node)}`,
                at(attribute)
            );
        }
        values.set(
            declaration.key,
            readValue(
                () => declaration.type.parse(attribute.value, node.inScopeNamespaces),
                at(attribute)
            )
        );
    }
    const attributes: Record<string, unknown> = {};
    if (!type) {
        return attributes;
    }
    for (const declaration of type.attributes.values()) {
        if (values.has(declaration.key)) {
            attributes[declaration.key] = values.get(declaration.key);
        } else if (declaration.required) {
            throw new XeneverValidationError(
                `Element ${written(node)} is missing attribute ${describeName(declaration.namespace, declaration.name)}`,
                at(node)
            );
        }
    }
    return attributes;
};

/**
 * Reads the child elements of an element with element-only content.
 *
 * @param node - node of the XML tree
 * @param type - its complex type, which has content
 * @returns the value of `children`
 * @throws {XeneverValidationError} when the children don't match the content model
 */
const readChildren = (node: XmlElementNode, type: CompiledComplex): Record<string, unknown> => {
    const { model, elements, keys } = type.content!;
    const values = new Map<string, unknown[]>();
    let term = model.start;
    for (const child of node.children) {
        if (child.kind === 'text') {
            // Whitespace between elements is formatting; any other text has nowhere to go.
            if (!whitespaceOnly.test(child.text)) {
                throw new XeneverValidationError(
                    `Text is not allowed in ${written(node)}, which has element-only content`,
                    { ...child.location, path: node.path }
                );
            }
            continue;
        }
        const name = expandedName(child.namespace, child.localName);
        const next = model.derive(term, name);
        if (model.isFailed(next)) {
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
        term = next;
        const declaration = elements.get(name)!;
        let list = values.get(declaration.key);
        if (!list) {
            list = [];
            values.set(declaration.key, list);
        }
        // eslint-disable-next-line @typescript-eslint/no-use-before-define -- `readElement` and this function call each other
        list.push(readElement(child, declaration));
    }
    if (!term.nullable) {
        throw new XeneverValidationError(
            `Element ${written(node)} is missing ${listLabels(expectedLabels(term))}`,
            at(node)
        );
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
 * Reads an element as its declaration says.
 *
 * @param node - node of the XML tree
 * @param declaration - what declares it
 * @returns its value
 * @throws {XeneverValidationError} when it doesn't match the declaration
 */
const readElement = (node: XmlElementNode, declaration: CompiledElement): unknown => {
    const { type } = declaration;
    if (type.kind === 'simple') {
        readAttributes(node, null);
        const text = textOf(node);
        return readValue(() => type.simple.parse(text, node.inScopeNamespaces), at(node));
    }
    const value: Record<string, unknown> = { attributes: readAttributes(node, type) };
    if (type.content) {
        value.children = readChildren(node, type);
    } else if (type.text) {
        const text = textOf(node);
        value.text = readValue(() => type.text!.parse(text, node.inScopeNamespaces), at(node));
    } else {
        // Cvc-complex-type.2.1: empty content allows no children at all, not even whitespace.
        const [first] = node.children;
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
 * Compiles a root declaration.
 *
 * @param element - the declaration
 * @returns its compiled form
 */
const compileRoot = (element: Element): CompiledElement => compileElement(element, '/');

/**
 * Reads a document whose root the compiled declaration declares.
 *
 * @param xml - XML text
 * @param root - what declares the root element
 * @returns the root's value
 * @throws {XeneverXmlError} when the document is not namespace-well-formed XML
 * @throws {XeneverValidationError} when the document doesn't match the declaration
 */
const readDocument = (xml: string, root: CompiledElement): unknown => {
    const node = readXml(xml);
    if (node.namespace !== root.namespace || node.localName !== root.name) {
        throw new XeneverValidationError(
            `Expected the root element ${describeName(root.namespace, root.name)}, not ${describeName(node.namespace, node.localName)}`,
            at(node)
        );
    }
    return readElement(node, root);
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
 * support, such as `xsi:type`
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
