import type { XmlErrorLocation } from '#internal/lib/errors.js';
import type { XmlAttributeNode, XmlElementNode, XmlTextNode } from './nodes.js';
import type { Locate } from './source.js';
import {
    parseXml,
    XmlElement,
    XmlError,
    XmlProcessingInstruction,
    XmlText,
} from '@rgrove/parse-xml';
import { XeneverXmlError } from '#internal/lib/errors.js';
import { xmlNamespace, xmlnsNamespace } from './nodes.js';
import { createLocate, locateAttributes, prescan } from './source.js';

/**
 * A name split into prefix and local name.
 */
interface QName {
    readonly prefix: string | null;
    readonly localName: string;
}

/**
 * Characters that may continue an XML name but not start one
 * ([`NameChar` minus `NameStartChar`](https://www.w3.org/TR/xml/#NT-NameChar)), as code point ranges. The
 * tokenizer already checked the whole name is an XML `Name`, so this is the one check its local part needs to
 * be an `NCName`.
 */
const nameCharOnlyRanges: readonly (readonly [first: string, last: string])[] = [
    ['-', '.'],
    ['0', '9'],
    ['\u{B7}', '\u{B7}'],
    ['\u{300}', '\u{36F}'],
    ['\u{203F}', '\u{2040}'],
];

/**
 * Whether a local name can't start an `NCName`, because its first character may only continue a name.
 *
 * @param localName - text after the colon
 * @returns whether its first character may only continue a name
 */
const isNameCharOnlyStart = (localName: string): boolean => {
    const first = localName.codePointAt(0)!;
    return nameCharOnlyRanges.some(
        ([low, high]) => first >= low.codePointAt(0)! && first <= high.codePointAt(0)!
    );
};

/**
 * Splits a name into a QName ([Namespaces in XML 1.0 §4](https://www.w3.org/TR/xml-names/#ns-qualnames)).
 *
 * @param name - an XML `Name`, as the tokenizer read it
 * @returns its prefix and local name, or `null` when it isn't a QName (more than one colon, or an empty or
 * invalid part)
 */
const splitQName = (name: string): QName | null => {
    const colon = name.indexOf(':');
    if (colon === -1) {
        return { prefix: null, localName: name };
    }
    const localName = name.slice(colon + 1);
    if (
        colon === 0 ||
        localName === '' ||
        localName.includes(':') ||
        isNameCharOnlyStart(localName)
    ) {
        return null;
    }
    return { prefix: name.slice(0, colon), localName };
};

/**
 * Converts a tokenizer error, whose position counts code points (`XmlError.pos`), to an offset in UTF-16 code
 * units, and rereads its message without the tokenizer's own location.
 *
 * @param error - what the tokenizer threw
 * @param xml - the document it read
 * @param locate - locates offsets in `xml`
 * @returns the error to throw
 */
const fromTokenizerError = (error: XmlError, xml: string, locate: Locate): XeneverXmlError => {
    let offset = 0;
    for (let codePoint = 0; codePoint < error.pos; codePoint++) {
        offset += String.fromCodePoint(xml.codePointAt(offset)!).length;
    }
    const message = error.message.slice(0, error.message.lastIndexOf(' (line '));
    return new XeneverXmlError(`Not well-formed XML: ${message}`, {
        ...locate(offset),
        path: '/',
        cause: error,
    });
};

/**
 * Rejects a namespace declaration that Namespaces in XML 1.0 forbids
 * ([§3](https://www.w3.org/TR/xml-names/#xmlReserved), [§5](https://www.w3.org/TR/xml-names/#scoping)).
 *
 * @param prefix - prefix declared, `''` for the default namespace
 * @param namespace - namespace name it is bound to
 * @param location - where the declaration is
 * @throws {XeneverXmlError} when the declaration is forbidden
 */
const checkDeclaration = (prefix: string, namespace: string, location: XmlErrorLocation): void => {
    const fail = (message: string): never => {
        throw new XeneverXmlError(message, location);
    };
    if (prefix === 'xmlns') {
        fail('The prefix `xmlns` must not be declared');
    }
    if (prefix === 'xml' && namespace !== xmlNamespace) {
        fail(`The prefix \`xml\` must not be bound to any namespace but \`${xmlNamespace}\``);
    }
    if (prefix !== 'xml' && namespace === xmlNamespace) {
        fail(`Only the prefix \`xml\` may be bound to \`${xmlNamespace}\``);
    }
    if (namespace === xmlnsNamespace) {
        fail(`No prefix may be bound to \`${xmlnsNamespace}\``);
    }
    if (prefix !== '' && namespace === '') {
        // XML 1.1 namespaces allow it; XML 1.0 namespaces, which xenever reads, don't.
        fail(`The prefix \`${prefix}\` must not be undeclared`);
    }
};

/**
 * Reads one document: the input, and how to locate offsets in it.
 */
class DocumentReader {
    readonly #xml: string;
    readonly #locate: Locate;

    /**
     * @param xml - input string
     * @param locate - locates offsets in `xml`
     */
    public constructor(xml: string, locate: Locate) {
        this.#xml = xml;
        this.#locate = locate;
    }

    /**
     * Rejects a processing instruction target with a colon, which namespace-well-formed XML doesn't allow
     * ([Namespaces in XML 1.0 §7](https://www.w3.org/TR/xml-names/#Conformance)).
     *
     * @param instruction - from the tokenizer
     * @param path - path to its parent
     * @throws {XeneverXmlError} when the target has a colon
     */
    public checkProcessingInstruction(instruction: XmlProcessingInstruction, path: string): void {
        if (instruction.name.includes(':')) {
            throw new XeneverXmlError(
                `Processing instruction target \`${instruction.name}\` must not contain a colon`,
                { ...this.#locate(instruction.start), path }
            );
        }
    }

    /**
     * Resolves an element, its attributes and its children against the namespaces in scope.
     *
     * @param element - element from the tokenizer
     * @param path - path to the element
     * @param parentNamespaces - namespaces in scope at its parent
     * @returns the resolved element
     * @throws {XeneverXmlError} when the element or a descendant is not namespace-well-formed
     */
    public readElement(
        element: XmlElement,
        path: string,
        parentNamespaces: ReadonlyMap<string, string>
    ): XmlElementNode {
        const location = this.#locate(element.start);
        const elementName = splitQName(element.name);
        if (!elementName) {
            throw new XeneverXmlError(`Element name \`${element.name}\` is not a valid QName`, {
                ...location,
                path,
            });
        }
        if (elementName.prefix === 'xmlns') {
            throw new XeneverXmlError('Element names must not have the prefix `xmlns`', {
                ...location,
                path,
            });
        }

        const attributeEntries = Object.entries(element.attributes);
        const attributeOffsets = locateAttributes(
            this.#xml,
            element.start,
            element.name,
            attributeEntries.map(([name]) => name)
        );

        // Shared with the parent until this element declares something.
        let namespaces = parentNamespaces;
        const declare = (prefix: string, namespace: string): void => {
            const copy = new Map(namespaces);
            if (namespace === '') {
                copy.delete(prefix);
            } else {
                copy.set(prefix, namespace);
            }
            namespaces = copy;
        };

        const attributes: {
            readonly name: QName;
            readonly value: string;
            readonly at: XmlErrorLocation;
        }[] = [];
        for (const [name, value] of attributeEntries) {
            const at = { ...this.#locate(attributeOffsets.get(name)!), path: `${path}/@${name}` };
            const attributeName = splitQName(name);
            if (!attributeName) {
                throw new XeneverXmlError(`Attribute name \`${name}\` is not a valid QName`, at);
            }
            if (attributeName.prefix === null && attributeName.localName === 'xmlns') {
                checkDeclaration('', value, at);
                declare('', value);
            } else if (attributeName.prefix === 'xmlns') {
                checkDeclaration(attributeName.localName, value, at);
                declare(attributeName.localName, value);
            } else {
                attributes.push({ name: attributeName, value, at });
            }
        }

        const resolvePrefix = (prefix: string, at: XmlErrorLocation): string => {
            const namespace = namespaces.get(prefix);
            if (namespace === undefined) {
                throw new XeneverXmlError(`Prefix \`${prefix}\` is not declared`, at);
            }
            return namespace;
        };

        // The default namespace applies to element names, never to attribute names.
        const namespace =
            elementName.prefix === null
                ? (namespaces.get('') ?? null)
                : resolvePrefix(elementName.prefix, { ...location, path });

        const expandedNames = new Set<string>();
        const resolvedAttributes = attributes.map(({ name, value, at }): XmlAttributeNode => {
            let attributeNamespace: string | null = null;
            if (name.prefix !== null) {
                attributeNamespace = resolvePrefix(name.prefix, at);
                // Attributes Unique ([Namespaces in XML 1.0 §6.3](https://www.w3.org/TR/xml-names/#uniqAttrs)):
                // two names that differ only in prefix are the same attribute. The tokenizer already rejects
                // a repeated unprefixed name, and an unprefixed name never shares a prefixed one's namespace.
                const expandedName = JSON.stringify([attributeNamespace, name.localName]);
                if (expandedNames.has(expandedName)) {
                    throw new XeneverXmlError(
                        `Attribute \`${name.localName}\` in namespace \`${attributeNamespace}\` is repeated`,
                        at
                    );
                }
                expandedNames.add(expandedName);
            }
            const { path: attributePath, ...attributeLocation } = at;
            return {
                value,
                localName: name.localName,
                prefix: name.prefix,
                namespace: attributeNamespace,
                location: attributeLocation,
                path: attributePath,
            };
        });

        return {
            kind: 'element',
            localName: elementName.localName,
            prefix: elementName.prefix,
            attributes: resolvedAttributes,
            children: this.#readChildren(element, path, namespaces),
            inScopeNamespaces: namespaces,
            namespace,
            location,
            path,
        };
    }

    /**
     * Resolves an element's children, merging adjacent text.
     *
     * @param element - element from the tokenizer
     * @param path - path to the element
     * @param namespaces - namespaces in scope at the element
     * @returns its child elements and text
     */
    #readChildren(
        element: XmlElement,
        path: string,
        namespaces: ReadonlyMap<string, string>
    ): (XmlElementNode | XmlTextNode)[] {
        // A path only numbers an element whose name is repeated among its siblings.
        const nameCounts = new Map<string, number>();
        for (const child of element.children) {
            if (child instanceof XmlElement) {
                nameCounts.set(child.name, (nameCounts.get(child.name) ?? 0) + 1);
            }
        }
        const nameIndexes = new Map<string, number>();

        const children: (XmlElementNode | XmlTextNode)[] = [];
        for (const child of element.children) {
            if (child instanceof XmlElement) {
                const index = (nameIndexes.get(child.name) ?? 0) + 1;
                nameIndexes.set(child.name, index);
                const childPath =
                    nameCounts.get(child.name) === 1
                        ? `${path}/${child.name}`
                        : `${path}/${child.name}[${index}]`;
                children.push(this.readElement(child, childPath, namespaces));
            } else if (child instanceof XmlText) {
                const previous = children.at(-1);
                if (previous?.kind === 'text') {
                    // Text either side of a dropped processing instruction.
                    children[children.length - 1] = {
                        ...previous,
                        text: previous.text + child.text,
                    };
                } else {
                    children.push({
                        kind: 'text',
                        text: child.text,
                        location: this.#locate(child.start),
                    });
                }
            } else if (child instanceof XmlProcessingInstruction) {
                // Without `preserveComments` and `preserveCdata`, there are no other kinds of child.
                this.checkProcessingInstruction(child, path);
            }
        }
        return children;
    }
}

/**
 * Reads an XML document into a namespace-resolved tree of its root element
 * ([Namespaces in XML 1.0](https://www.w3.org/TR/xml-names/)). The tokenizer is non-validating: no DTD is
 * accepted, and no entity but the five predefined ones and character references is expanded.
 *
 * @param xml - XML document
 * @returns its root element
 * @throws {XeneverXmlError} when the document is not namespace-well-formed XML, has a DOCTYPE, or nests
 * elements deeper than 256
 */
export const readXml = (xml: string): XmlElementNode => {
    const locate = createLocate(xml);
    prescan(xml, locate);

    let document;
    try {
        document = parseXml(xml, { includeOffsets: true });
    } catch (error) {
        // Unreachable: the prescan's depth limit keeps the call stack from overflowing, the only other error
        // the tokenizer could throw with these options.
        /* c8 ignore next 3 */
        if (!(error instanceof XmlError)) {
            throw error;
        }
        throw fromTokenizerError(error, xml, locate);
    }

    const reader = new DocumentReader(xml, locate);
    for (const child of document.children) {
        // Without the `preserve*` options, the root's only siblings are processing instructions.
        if (child instanceof XmlProcessingInstruction) {
            reader.checkProcessingInstruction(child, '/');
        }
    }
    const root = document.root!;
    return reader.readElement(root, `/${root.name}`, new Map([['xml', xmlNamespace]]));
};
