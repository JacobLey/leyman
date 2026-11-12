import type { XmlLocation } from '#internal/lib/errors.js';

/**
 * Namespace name of the `xml` prefix, which is always in scope and can't be bound to another prefix
 * ([Namespaces in XML 1.0 §3](https://www.w3.org/TR/xml-names/#xmlReserved)).
 */
export const xmlNamespace = 'http://www.w3.org/XML/1998/namespace';

/**
 * Namespace name of the `xmlns` prefix, which is never declared and can't be bound to another prefix
 * ([Namespaces in XML 1.0 §3](https://www.w3.org/TR/xml-names/#xmlReserved)).
 */
export const xmlnsNamespace = 'http://www.w3.org/2000/xmlns/';

/**
 * An attribute of an element. Namespace declarations (`xmlns`, `xmlns:*`) are not attributes: they are in the
 * element's `inScopeNamespaces`.
 */
export interface XmlAttributeNode {
    /**
     * Namespace name, or `null` for an unprefixed attribute: the default namespace never applies to attributes.
     */
    readonly namespace: string | null;
    readonly localName: string;
    /**
     * Prefix as written. Cosmetic: two documents that differ only in prefixes read the same otherwise.
     */
    readonly prefix: string | null;
    /**
     * Value, with references expanded and whitespace normalized as XML 1.0 does for CDATA attributes
     * ([§3.3.3](https://www.w3.org/TR/xml/#AVNormalize)): each literal tab, line feed, carriage return or
     * `\r\n` is a space.
     */
    readonly value: string;
    /**
     * Where the attribute's name starts.
     */
    readonly location: XmlLocation;
    /**
     * Path to the attribute, e.g. `/order/item[2]/@sku` (see `XmlErrorLocation.path`).
     */
    readonly path: string;
}

/**
 * Character data: text, CDATA sections and references, with adjacent runs merged into one node across the
 * comments and processing instructions that are dropped between them. Line breaks are normalized to `\n`.
 */
export interface XmlTextNode {
    readonly kind: 'text';
    readonly text: string;
    /**
     * Where the first run of the text starts (for a CDATA section, its `<![CDATA[`).
     */
    readonly location: XmlLocation;
}

/**
 * An element, with its name resolved against the namespaces in scope.
 */
export interface XmlElementNode {
    readonly kind: 'element';
    /**
     * Namespace name: of its prefix, or of the default namespace when unprefixed. `null` when in no namespace.
     */
    readonly namespace: string | null;
    readonly localName: string;
    /**
     * Prefix as written. Cosmetic: two documents that differ only in prefixes read the same otherwise.
     */
    readonly prefix: string | null;
    /**
     * Attributes in document order, without namespace declarations.
     */
    readonly attributes: readonly XmlAttributeNode[];
    /**
     * Child elements and text in document order. Comments and processing instructions are dropped.
     */
    readonly children: readonly (XmlElementNode | XmlTextNode)[];
    /**
     * Where the element's start tag (its `<`) starts.
     */
    readonly location: XmlLocation;
    /**
     * Path to the element, e.g. `/order/item[2]` (see `XmlErrorLocation.path`).
     */
    readonly path: string;
    /**
     * Namespaces in scope at this element, including its own declarations: prefix to namespace name, with the
     * default namespace under `''` (absent when there is none). Always has `xml`. For resolving QName values.
     */
    readonly inScopeNamespaces: ReadonlyMap<string, string>;
}
