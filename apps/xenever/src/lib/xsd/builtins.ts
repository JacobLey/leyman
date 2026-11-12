import type { Attribute, ComplexType, SimpleType } from '#internal/lib/schema/ir.js';
import { builtins } from '#internal/lib/simple/builtins.js';
import { xmlNamespace } from '#internal/lib/xml/nodes.js';

/**
 * Built-in types the IR has as a kind of its own, by local name in the XML Schema namespace.
 */
export const atomicKinds: ReadonlySet<string> = new Set(Object.keys(builtins));

/**
 * Built-in integer types that take the `bigint` option.
 */
export const bigIntegerKinds: ReadonlySet<string> = new Set([
    'integer',
    'long',
    'negativeInteger',
    'nonNegativeInteger',
    'nonPositiveInteger',
    'positiveInteger',
    'unsignedLong',
]);

/**
 * Built-in list types, by their item type: each holds at least one item
 * ([XSD 1.1 Part 2 §3.4.6](https://www.w3.org/TR/xmlschema11-2/#NMTOKENS)).
 */
export const listKinds: ReadonlyMap<string, 'ENTITY' | 'IDREF' | 'NMTOKEN'> = new Map([
    ['NMTOKENS', 'NMTOKEN'],
    ['IDREFS', 'IDREF'],
    ['ENTITIES', 'ENTITY'],
] as const);

/**
 * Built-in types XSD 1.1 added.
 */
export const xsd11Types: ReadonlySet<string> = new Set([
    'anyAtomicType',
    'dateTimeStamp',
    'dayTimeDuration',
    'error',
    'yearMonthDuration',
]);

/**
 * Builds `xs:anyType`, the type of an element declared without one: any attributes, and mixed content of any
 * elements, kept as nodes ([XSD 1.1 Part 1 §3.4.7](https://www.w3.org/TR/xmlschema11-1/#builtin-ctd)). XSD
 * validates them laxly, against global declarations when there are any; xenever keeps every wildcard match
 * unvalidated, as `processContents="skip"` does.
 *
 * @returns the type, a new object each call, so no two schema sets share one
 */
export const createAnyType = (): ComplexType => ({
    kind: 'complex',
    mixed: true,
    attributes: [{ kind: 'anyAttribute' }],
    content: {
        kind: 'sequence',
        particles: [{ kind: 'any', minOccurs: 0, maxOccurs: 'unbounded' }],
    },
});

/**
 * Builds the attributes of the XML namespace, as `xml.xsd` declares them
 * ([XML namespace document](https://www.w3.org/2001/xml.xsd)), so importing that namespace needs no file.
 *
 * @returns the declarations by local name, new objects each call
 */
export const createXmlAttributes = (): ReadonlyMap<string, Attribute> =>
    new Map(
        (
            [
                [
                    'lang',
                    {
                        kind: 'union',
                        members: [
                            { kind: 'language' },
                            { kind: 'string', facets: { enumeration: [''] } },
                        ],
                    },
                ],
                ['space', { kind: 'NCName', facets: { enumeration: ['default', 'preserve'] } }],
                ['base', { kind: 'anyURI' }],
                ['id', { kind: 'ID' }],
            ] as const satisfies readonly (readonly [string, SimpleType])[]
        ).map(([name, type]) => [name, { kind: 'attribute', namespace: xmlNamespace, name, type }])
    );

/**
 * Local names of the attributes in `xml:specialAttrs`, the attribute group of `xml.xsd`.
 */
export const xmlSpecialAttributes: readonly string[] = ['lang', 'space', 'base'];
