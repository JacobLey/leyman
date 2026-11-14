/* eslint-disable @typescript-eslint/no-magic-numbers -- Test data: counts, line numbers and values of the documents */
import type { ErrorLocation } from './values.js';
import { findAll, leaves, orderOf, remove, replaceFirst, show } from './values.js';

/**
 * What a value check found: `true` when it passed, else what it saw instead.
 */
export type Found = true | string;

/**
 * One check of a tool, in one scenario. Documents are named in the scenario's `documents`.
 */
export type Probe = { readonly description: string } & (
    | {
          /**
           * The document is rejected with an error whose location passes the check.
           */
          readonly kind: 'location';
          readonly document: string;
          readonly check: (location: ErrorLocation) => boolean;
      }
    | {
          /**
           * The document parses to a value the check passes. With `rejectionPasses`, rejecting it passes too: for a
           * document that is only dangerous when read.
           */
          readonly kind: 'value';
          readonly document: string;
          readonly check: (value: unknown) => Found;
          readonly rejectionPasses?: boolean;
      }
    | {
          /**
           * The document parses without an error.
           */
          readonly kind: 'accepts';
          readonly document: string;
      }
    | {
          /**
           * The documents parse to equal values.
           */
          readonly kind: 'same';
          readonly documents: readonly string[];
      }
    | {
          /**
           * The document throws, or is reported invalid.
           */
          readonly kind: 'rejects';
          readonly document: string;
      }
    | {
          /**
           * The value of the scenario's `subject` document, changed by `value` (unchanged without it), type-checks
           * against the tool's type, or with `rejects` fails to. `value` returns `undefined` when the parsed value has
           * nothing to change, which fails the probe.
           */
          readonly kind: 'type';
          readonly value?: (parsed: unknown) => unknown;
          readonly rejects: boolean;
      }
);

/**
 * A schema, the documents read with it, and the probes run on every tool.
 */
export interface Scenario {
    /**
     * Stable id, which hand-written setups (fast-xml-parser's) are keyed by.
     */
    readonly id: string;
    /**
     * Row the probes are grouped under in the report.
     */
    readonly feature: string;
    /**
     * XSD files by absolute path, and the path of the one to load.
     */
    readonly schema: {
        readonly files: Readonly<Record<string, string>>;
        readonly entry: string;
        /**
         * Local name of the global element every document has as its root.
         */
        readonly element: string;
    };
    /**
     * Whether the probes are about reading an XSD, so a tool that reads none has nothing to run.
     */
    readonly xsdOnly?: boolean;
    /**
     * Options of xenever's loader the scenario turns on, as a user of these documents would.
     */
    readonly xenever?: { readonly bigint?: boolean; readonly ordered?: readonly string[] };
    readonly documents: Readonly<Record<string, string>>;
    /**
     * Document whose parsed value `type` probes check against the tool's type.
     */
    readonly subject: string;
    readonly probes: readonly Probe[];
}

/**
 * Paths of the files the security documents point at, which a safe parser never reads.
 */
export interface SecretFiles {
    /**
     * A text file holding `secretMarker`.
     */
    readonly secret: string;
    /**
     * A DTD declaring the entity `secret` as `secretMarker`.
     */
    readonly dtd: string;
}

/**
 * Text in the secret files, which must never show up in a parsed value.
 */
export const secretMarker = 'TOP-SECRET-MARKER';

const xsdNamespace = 'http://www.w3.org/2001/XMLSchema';

/**
 * An XSD document.
 *
 * @param body - lines of the components it declares
 * @param targetNamespace - its target namespace, with elements qualified, or none
 * @param prefixes - other namespaces it refers to, by prefix
 * @returns the text of the XSD
 */
const xsd = (
    body: readonly string[],
    targetNamespace?: string,
    prefixes: Readonly<Record<string, string>> = {}
): string =>
    [
        [
            `<xs:schema xmlns:xs="${xsdNamespace}"`,
            ...Object.entries(prefixes).map(
                ([prefix, namespace]) => ` xmlns:${prefix}="${namespace}"`
            ),
            targetNamespace === undefined
                ? '>'
                : ` xmlns="${targetNamespace}" targetNamespace="${targetNamespace}" elementFormDefault="qualified">`,
        ].join(''),
        ...body.map(line => `  ${line}`),
        '</xs:schema>',
    ].join('\n');

const lines = (...text: readonly string[]): string => text.join('\n');

const passes = (isMatch: boolean, found: unknown): Found => isMatch || `found ${show(found)}`;

/**
 * The value under the first key of this local name.
 *
 * @param value - parsed value
 * @param name - local name
 * @returns its value, if any
 */
const first = (value: unknown, name: string): unknown => findAll(value, name)[0];

const itemArrayOf = (length: number) => (value: unknown) => {
    const found = first(value, 'item');
    return passes(Array.isArray(found) && found.length === length, found);
};

const leavesInclude =
    (...expected: readonly string[]) =>
    (value: unknown): Found => {
        const found = leaves(value);
        return passes(
            expected.every(leaf => found.includes(leaf)),
            found
        );
    };

const inOrder =
    (...expected: readonly string[]) =>
    (value: unknown): Found => {
        const found = orderOf(value, expected);
        return passes(show(found) === show(expected), found);
    };

/**
 * The value with the first property of a local name given a value of another type, which a precise type rejects.
 *
 * @param name - local name
 * @returns the change
 */
const otherType = (name: string) => (parsed: unknown) =>
    replaceFirst(parsed, name, old => (typeof old === 'string' ? 1 : 'one'));

const without = (name: string) => (parsed: unknown) => replaceFirst(parsed, name, () => remove);

const accepts = (description: string, document: string): Probe => ({
    kind: 'accepts',
    description,
    document,
});
const rejects = (description: string, document: string): Probe => ({
    kind: 'rejects',
    description,
    document,
});
const typeMatches: Probe = {
    kind: 'type',
    description: 'the type accepts the parsed value',
    rejects: false,
};

// A purchase order, after the one in the XML Schema primer: https://www.w3.org/TR/xmlschema-0/#po.xsd

const poNamespace = 'urn:example:po';
const poPath = '/schemas/po.xsd';
const poSchema = {
    files: {
        [poPath]: xsd(
            [
                '<xs:element name="purchaseOrder" type="PurchaseOrderType"/>',
                '<xs:complexType name="PurchaseOrderType">',
                '  <xs:sequence>',
                '    <xs:element name="shipTo" type="Address"/>',
                '    <xs:element name="comment" type="xs:string" minOccurs="0"/>',
                '    <xs:element name="item" type="Item" maxOccurs="unbounded"/>',
                '  </xs:sequence>',
                '  <xs:attribute name="orderDate" type="xs:date" use="required"/>',
                '</xs:complexType>',
                '<xs:complexType name="Address">',
                '  <xs:sequence>',
                '    <xs:element name="name" type="xs:string"/>',
                '    <xs:element name="street" type="xs:string" maxOccurs="2"/>',
                '    <xs:element name="zip" type="xs:string"/>',
                '  </xs:sequence>',
                '</xs:complexType>',
                '<xs:complexType name="Item">',
                '  <xs:sequence>',
                '    <xs:element name="productName" type="xs:string"/>',
                '    <xs:element name="quantity" type="Quantity"/>',
                '    <xs:element name="price" type="xs:decimal"/>',
                '    <xs:element name="shipDate" type="xs:date" minOccurs="0"/>',
                '  </xs:sequence>',
                '  <xs:attribute name="partNum" type="SKU" use="required"/>',
                '</xs:complexType>',
                '<xs:simpleType name="Quantity">',
                '  <xs:restriction base="xs:positiveInteger">',
                '    <xs:maxExclusive value="100"/>',
                '  </xs:restriction>',
                '</xs:simpleType>',
                '<xs:simpleType name="SKU">',
                '  <xs:restriction base="xs:string">',
                '    <xs:pattern value="\\d{3}-[A-Z]{2}"/>',
                '  </xs:restriction>',
                '</xs:simpleType>',
            ],
            poNamespace
        ),
    },
    entry: poPath,
    element: 'purchaseOrder',
};

/**
 * What goes in a purchase order.
 */
export interface PurchaseOrderOptions {
    /**
     * Items in it.
     */
    readonly items: number;
    /**
     * Lines of street, at most 2 in a valid order.
     */
    readonly streets?: number;
    /**
     * Its comment, if any.
     */
    readonly comment?: string;
}

/**
 * A purchase order, the same for the same options: item `n` has part number `nnn-AB`, a quantity from 1 to 99, a
 * price with cents, and every third a ship date.
 *
 * @param options - what goes in it
 * @returns the document
 */
export const purchaseOrder = ({ items, streets = 1, comment }: PurchaseOrderOptions): string =>
    lines(
        `<purchaseOrder xmlns="${poNamespace}" orderDate="2026-11-12">`,
        '  <shipTo>',
        '    <name>Alice Smith</name>',
        ...Array.from(
            { length: streets },
            (_, index) => `    <street>${123 + index} Maple Street</street>`
        ),
        '    <zip>90952</zip>',
        '  </shipTo>',
        ...(comment === undefined ? [] : [`  <comment>${comment}</comment>`]),
        ...Array.from({ length: items }, (_, index) =>
            lines(
                `  <item partNum="${String(index % 1000).padStart(3, '0')}-AB">`,
                `    <productName>Product ${index}</productName>`,
                `    <quantity>${(index % 99) + 1}</quantity>`,
                `    <price>${index}.${String(index % 100).padStart(2, '0')}</price>`,
                ...(index % 3 === 2
                    ? [
                          `    <shipDate>2026-12-${String((index % 28) + 1).padStart(2, '0')}</shipDate>`,
                      ]
                    : []),
                '  </item>'
            )
        ),
        '</purchaseOrder>'
    );

/**
 * The schema the benchmark reads its purchase orders with, and the order it times.
 *
 * @param items - items in the order
 * @returns the scenario, with no probes
 */
export const benchmarkScenario = (items: number): Scenario => ({
    id: 'benchmark',
    feature: 'Benchmark',
    schema: poSchema,
    documents: { order: purchaseOrder({ items }) },
    subject: 'order',
    probes: [],
});

const oneItem = purchaseOrder({ items: 1 });
const threeItems = purchaseOrder({
    items: 3,
    streets: 2,
    comment: 'Hurry, my lawn is going wild!',
});

// Lines of an order with an invalid quantity on line 14, and a mismatched end tag on line 9
const misplaced = [
    `<purchaseOrder xmlns="${poNamespace}" orderDate="2026-11-12">`,
    '  <shipTo>',
    '    <name>Alice Smith</name>',
    '    <street>123 Maple Street</street>',
    '    <zip>90952</zip>',
    '  </shipTo>',
    '  <item partNum="872-AA">',
    '    <productName>Lawnmower</productName>',
    '    <quantity>1</quantity>',
    '    <price>148.95</price>',
    '  </item>',
    '  <item partNum="926-AA">',
    '    <productName>Baby Monitor</productName>',
    '    <quantity>many</quantity>',
    '    <price>39.98</price>',
    '  </item>',
    '</purchaseOrder>',
];

const repeated: Scenario = {
    id: 'repeated',
    feature: 'One or many, from maxOccurs',
    schema: poSchema,
    documents: {
        one: oneItem,
        three: threeItems,
        threeStreets: purchaseOrder({ items: 1, streets: 3 }),
    },
    subject: 'one',
    probes: [
        {
            kind: 'value',
            description: 'a repeatable element is an array when it occurs once',
            document: 'one',
            check: itemArrayOf(1),
        },
        {
            kind: 'value',
            description: 'a repeatable element keeps every occurrence',
            document: 'three',
            check: itemArrayOf(3),
        },
        {
            kind: 'value',
            description: 'an element that occurs at most once is not an array',
            document: 'three',
            check: value => {
                const found = first(value, 'name');
                return passes(typeof found === 'string', found);
            },
        },
        {
            kind: 'type',
            description: 'the type rejects a single item that is not in an array',
            value: parsed =>
                replaceFirst(parsed, 'item', old => (Array.isArray(old) ? old[0] : undefined)),
            rejects: true,
        },
        rejects('rejects more occurrences than maxOccurs', 'threeStreets'),
    ],
};

const optional: Scenario = {
    id: 'optional',
    feature: 'Optional elements',
    schema: poSchema,
    documents: {
        without: oneItem,
        with: threeItems,
        missingRequired: oneItem.replace('    <productName>Product 0</productName>\n', ''),
    },
    subject: 'with',
    probes: [
        {
            kind: 'value',
            description: 'an absent optional element has no key',
            document: 'without',
            check: value =>
                passes(findAll(value, 'comment').length === 0, findAll(value, 'comment')),
        },
        {
            kind: 'value',
            description: 'a present optional element has its value',
            document: 'with',
            check: value => {
                const found = first(value, 'comment');
                return passes(found === 'Hurry, my lawn is going wild!', found);
            },
        },
        {
            kind: 'type',
            description: 'the type accepts the value without the optional element',
            value: without('comment'),
            rejects: false,
        },
        {
            kind: 'type',
            description: 'the type rejects the value without a required element',
            value: without('productName'),
            rejects: true,
        },
        rejects('rejects a missing required element', 'missingRequired'),
    ],
};

const attributes: Scenario = {
    id: 'attributes',
    feature: 'Attributes and children',
    schema: {
        files: {
            '/schemas/book.xsd': xsd([
                '<xs:element name="book">',
                '  <xs:complexType>',
                '    <xs:sequence>',
                '      <xs:element name="id" type="xs:string"/>',
                '      <xs:element name="title" type="Title"/>',
                '    </xs:sequence>',
                '    <xs:attribute name="id" type="xs:string" use="required"/>',
                '    <xs:attribute name="lang" type="xs:language"/>',
                '  </xs:complexType>',
                '</xs:element>',
                '<xs:complexType name="Title">',
                '  <xs:simpleContent>',
                '    <xs:extension base="xs:string">',
                '      <xs:attribute name="lang" type="xs:language"/>',
                '    </xs:extension>',
                '  </xs:simpleContent>',
                '</xs:complexType>',
            ]),
        },
        entry: '/schemas/book.xsd',
        element: 'book',
    },
    documents: {
        book: '<book id="b-1" lang="en"><id>isbn-0-15-601219-8</id><title lang="fr">Le Petit Prince</title></book>',
        unknownAttribute:
            '<book id="b-1" color="red"><id>isbn-0-15-601219-8</id><title>Le Petit Prince</title></book>',
        missingAttribute: '<book><id>isbn-0-15-601219-8</id><title>Le Petit Prince</title></book>',
    },
    subject: 'book',
    probes: [
        {
            kind: 'value',
            description: 'keeps an attribute and a child element of the same name',
            document: 'book',
            check: leavesInclude('b-1', 'isbn-0-15-601219-8'),
        },
        {
            kind: 'value',
            description: 'keeps the attribute and text of a text-only element',
            document: 'book',
            check: leavesInclude('fr', 'Le Petit Prince'),
        },
        typeMatches,
        rejects('rejects an undeclared attribute', 'unknownAttribute'),
        rejects('rejects a missing required attribute', 'missingAttribute'),
    ],
};

const invoiceNamespace = 'urn:example:invoice';
const invoice = (namespaces: string, prefix: string): string =>
    `<${prefix}invoice ${namespaces}><${prefix}number>INV-7</${prefix}number><${prefix}line qty="2"><${prefix}sku>A-1</${prefix}sku></${prefix}line></${prefix}invoice>`;

const namespaces: Scenario = {
    id: 'namespaces',
    feature: 'Namespaces and prefixes',
    schema: {
        files: {
            '/schemas/invoice.xsd': xsd(
                [
                    '<xs:element name="invoice">',
                    '  <xs:complexType>',
                    '    <xs:sequence>',
                    '      <xs:element name="number" type="xs:string"/>',
                    '      <xs:element name="line" maxOccurs="unbounded">',
                    '        <xs:complexType>',
                    '          <xs:sequence>',
                    '            <xs:element name="sku" type="xs:string"/>',
                    '          </xs:sequence>',
                    '          <xs:attribute name="qty" type="xs:int" use="required"/>',
                    '        </xs:complexType>',
                    '      </xs:element>',
                    '    </xs:sequence>',
                    '  </xs:complexType>',
                    '</xs:element>',
                ],
                invoiceNamespace
            ),
        },
        entry: '/schemas/invoice.xsd',
        element: 'invoice',
    },
    documents: {
        inv: invoice(`xmlns:inv="${invoiceNamespace}"`, 'inv:'),
        i: invoice(`xmlns:i="${invoiceNamespace}"`, 'i:'),
        defaultNamespace: invoice(`xmlns="${invoiceNamespace}"`, ''),
        otherNamespace: invoice('xmlns="urn:example:other"', ''),
        noNamespace: invoice('', ''),
    },
    subject: 'inv',
    probes: [
        {
            kind: 'same',
            description:
                'the same document with prefix inv:, prefix i: or a default namespace reads the same',
            documents: ['inv', 'i', 'defaultNamespace'],
        },
        typeMatches,
        rejects('rejects the right local names in another namespace', 'otherNamespace'),
        rejects('rejects the right local names in no namespace', 'noNamespace'),
    ],
};

const mixed: Scenario = {
    id: 'mixed',
    feature: 'Mixed content',
    schema: {
        files: {
            '/schemas/para.xsd': xsd([
                '<xs:element name="para">',
                '  <xs:complexType mixed="true">',
                '    <xs:choice minOccurs="0" maxOccurs="unbounded">',
                '      <xs:element name="b" type="xs:string"/>',
                '      <xs:element name="i" type="xs:string"/>',
                '    </xs:choice>',
                '  </xs:complexType>',
                '</xs:element>',
            ]),
        },
        entry: '/schemas/para.xsd',
        element: 'para',
    },
    documents: {
        para: '<para>Call <b>now</b> or <i>later</i>.</para>',
        unknownElement: '<para>Call <u>now</u>.</para>',
    },
    subject: 'para',
    probes: [
        {
            kind: 'value',
            description: 'keeps text and elements in document order',
            document: 'para',
            check: inOrder('Call', 'now', 'or', 'later', '.'),
        },
        typeMatches,
        rejects('rejects an undeclared element inside text', 'unknownElement'),
    ],
};

const order: Scenario = {
    id: 'order',
    feature: 'Order and interleaving',
    schema: {
        files: {
            '/schemas/route.xsd': xsd([
                '<xs:element name="route">',
                '  <xs:complexType>',
                '    <xs:choice maxOccurs="unbounded">',
                '      <xs:element name="stop" type="xs:string"/>',
                '      <xs:element name="wait" type="xs:duration"/>',
                '    </xs:choice>',
                '  </xs:complexType>',
                '</xs:element>',
            ]),
        },
        entry: '/schemas/route.xsd',
        element: 'route',
    },
    // A user who needs the order of a repeated choice asks for it on that element
    xenever: { ordered: ['route'] },
    documents: {
        route: '<route><stop>Depot</stop><wait>PT10M</wait><stop>Harbor</stop></route>',
        badDuration: '<route><stop>Depot</stop><wait>ten minutes</wait></route>',
    },
    subject: 'route',
    probes: [
        {
            kind: 'value',
            description: 'keeps interleaved elements in document order',
            document: 'route',
            check: inOrder('Depot', 'PT10M', 'Harbor'),
        },
        typeMatches,
        rejects('rejects an invalid duration', 'badDuration'),
    ],
};

const numbers: Scenario = {
    id: 'numbers',
    feature: 'Numbers',
    schema: {
        files: {
            '/schemas/reading.xsd': xsd([
                '<xs:element name="reading">',
                '  <xs:complexType>',
                '    <xs:sequence>',
                '      <xs:element name="amount" type="xs:decimal"/>',
                '      <xs:element name="total" type="xs:integer"/>',
                '      <xs:element name="count" type="xs:int"/>',
                '      <xs:element name="valid" type="xs:boolean"/>',
                '    </xs:sequence>',
                '  </xs:complexType>',
                '</xs:element>',
            ]),
        },
        entry: '/schemas/reading.xsd',
        element: 'reading',
    },
    // Without it, xenever rejects an integer past 2^53 rather than round it
    xenever: { bigint: true },
    documents: {
        reading: lines(
            '<reading>',
            '  <amount>12345678901234567890.10</amount>',
            '  <total>9007199254740993</total>',
            '  <count>42</count>',
            '  <valid>1</valid>',
            '</reading>'
        ),
        overflow:
            '<reading><amount>1</amount><total>1</total><count>3000000000</count><valid>true</valid></reading>',
        notBoolean:
            '<reading><amount>1</amount><total>1</total><count>1</count><valid>yes</valid></reading>',
    },
    subject: 'reading',
    probes: [
        {
            kind: 'value',
            description: 'keeps every digit of a 22-digit decimal',
            document: 'reading',
            check: value => {
                const found = first(value, 'amount');
                // As written, or without its trailing zero
                return passes(
                    ['12345678901234567890.10', '12345678901234567890.1'].includes(String(found)),
                    found
                );
            },
        },
        {
            kind: 'value',
            description: 'keeps an integer past 2^53 exact',
            document: 'reading',
            check: value => {
                const found = first(value, 'total');
                return passes(String(found) === '9007199254740993', found);
            },
        },
        {
            kind: 'value',
            description: 'reads an xs:int as a number',
            document: 'reading',
            check: value => {
                const found = first(value, 'count');
                return passes(found === 42, found);
            },
        },
        {
            kind: 'value',
            description: 'reads the xs:boolean 1 as true',
            document: 'reading',
            check: value => {
                const found = first(value, 'valid');
                return passes(found === true, found);
            },
        },
        typeMatches,
        rejects('rejects an xs:int out of range', 'overflow'),
        rejects('rejects an invalid xs:boolean', 'notBoolean'),
    ],
};

const tenOf = (entity: string): string => `&${entity};`.repeat(10);

/**
 * Billion laughs: each entity is ten of the one before, so `&f;` is a million characters.
 */
const laughs = lines(
    '<?xml version="1.0"?>',
    '<!DOCTYPE note [',
    '  <!ENTITY a "aaaaaaaaaa">',
    ...(
        [
            ['b', 'a'],
            ['c', 'b'],
            ['d', 'c'],
            ['e', 'd'],
            ['f', 'e'],
        ] as const
    ).map(([name, previous]) => `  <!ENTITY ${name} "${tenOf(previous)}">`),
    ']>',
    '<note><body>&f;</body></note>'
);

/**
 * A file URL, without importing `node:url`, so documents stay plain strings.
 *
 * @param path - absolute POSIX path
 * @returns its URL
 */
const pathToFileUrl = (path: string): string => `file://${encodeURI(path)}`;

const neverRead = (value: unknown): Found => passes(!show(value).includes(secretMarker), value);

const security = (files: SecretFiles): Scenario => ({
    id: 'security',
    feature: 'DTDs and entities',
    schema: {
        files: {
            '/schemas/note.xsd': xsd([
                '<xs:element name="note">',
                '  <xs:complexType>',
                '    <xs:sequence>',
                '      <xs:element name="body" type="xs:string"/>',
                '    </xs:sequence>',
                '  </xs:complexType>',
                '</xs:element>',
            ]),
        },
        entry: '/schemas/note.xsd',
        element: 'note',
    },
    documents: {
        laughs,
        note: '<note><body>Hello</body></note>',
        externalEntity: lines(
            `<!DOCTYPE note [<!ENTITY secret SYSTEM "${pathToFileUrl(files.secret)}">]>`,
            '<note><body>&secret;</body></note>'
        ),
        externalDtd: lines(
            `<!DOCTYPE note SYSTEM "${pathToFileUrl(files.dtd)}">`,
            '<note><body>&secret;</body></note>'
        ),
    },
    subject: 'note',
    probes: [
        accepts('accepts a plain document', 'note'),
        {
            kind: 'value',
            description: 'rejects or doesn’t expand nested entities (billion laughs)',
            document: 'laughs',
            check: value => {
                const longest = Math.max(0, ...leaves(value).map(leaf => leaf.length));
                return longest < 1000 || `expanded to ${longest} characters`;
            },
            rejectionPasses: true,
        },
        {
            kind: 'value',
            description: 'rejects or doesn’t read an external entity (XXE)',
            document: 'externalEntity',
            check: neverRead,
            rejectionPasses: true,
        },
        {
            kind: 'value',
            description: 'rejects or doesn’t load an external DTD',
            document: 'externalDtd',
            check: neverRead,
            rejectionPasses: true,
        },
    ],
});

const valid = oneItem;
const invalid: Scenario = {
    id: 'invalid',
    feature: 'Rejecting invalid documents',
    schema: poSchema,
    documents: {
        valid,
        missingElement: valid.replace('    <name>Alice Smith</name>\n', ''),
        unknownElement: valid.replace('  </shipTo>', '  </shipTo>\n  <gift>yes</gift>'),
        unknownAttribute: valid.replace('partNum="000-AB"', 'partNum="000-AB" color="red"'),
        outOfOrder: valid.replace(
            '    <street>123 Maple Street</street>\n    <zip>90952</zip>',
            '    <zip>90952</zip>\n    <street>123 Maple Street</street>'
        ),
        notANumber: valid.replace('<quantity>1</quantity>', '<quantity>two</quantity>'),
        outOfRange: valid.replace('<quantity>1</quantity>', '<quantity>100</quantity>'),
        badPattern: valid.replace('partNum="000-AB"', 'partNum="ABC"'),
        missingAttribute: valid.replace(' orderDate="2026-11-12"', ''),
        badDate: valid.replace('orderDate="2026-11-12"', 'orderDate="tomorrow"'),
        notWellFormed: valid.replace('</purchaseOrder>', '</purchaseorder>'),
    },
    subject: 'valid',
    probes: [
        accepts('accepts the valid order', 'valid'),
        rejects('rejects a missing required element', 'missingElement'),
        rejects('rejects an undeclared element', 'unknownElement'),
        rejects('rejects an undeclared attribute', 'unknownAttribute'),
        rejects('rejects elements out of sequence order', 'outOfOrder'),
        rejects('rejects text in a number', 'notANumber'),
        rejects('rejects a number past maxExclusive', 'outOfRange'),
        rejects('rejects a value that misses its pattern', 'badPattern'),
        rejects('rejects a missing required attribute', 'missingAttribute'),
        rejects('rejects an invalid date', 'badDate'),
        rejects('rejects a document that isn’t well-formed', 'notWellFormed'),
    ],
};

const locations: Scenario = {
    id: 'locations',
    feature: 'Error locations',
    schema: poSchema,
    documents: {
        badQuantity: lines(...misplaced),
        mismatchedTag: lines(
            ...misplaced.with(8, '    <quantity>1</quantiy>').with(13, '    <quantity>2</quantity>')
        ),
    },
    subject: 'badQuantity',
    probes: [
        {
            kind: 'location',
            description: 'gives the line of an invalid value',
            document: 'badQuantity',
            check: ({ line }) => line === 14,
        },
        {
            kind: 'location',
            description: 'gives a column with that line',
            document: 'badQuantity',
            check: ({ line, column }) => line === 14 && column !== undefined,
        },
        {
            kind: 'location',
            description: 'gives the path to the second item',
            document: 'badQuantity',
            check: ({ path }) => path.includes('item[2]'),
        },
        {
            kind: 'location',
            description: 'gives the line of a mismatched end tag',
            document: 'mismatchedTag',
            check: ({ line }) => line === 9,
        },
    ],
};

const types: Scenario = {
    id: 'types',
    feature: 'Types match values',
    schema: poSchema,
    documents: { order: threeItems },
    subject: 'order',
    probes: [
        typeMatches,
        {
            kind: 'type',
            description: 'the type rejects a string',
            value: () => 'purchase order',
            rejects: true,
        },
        {
            kind: 'type',
            description: 'the type rejects the value without a required element',
            value: without('shipTo'),
            rejects: true,
        },
        {
            kind: 'type',
            description: 'the type rejects a decimal of another type',
            value: otherType('price'),
            rejects: true,
        },
        {
            kind: 'type',
            description: 'the type rejects a quantity of another type',
            value: otherType('quantity'),
            rejects: true,
        },
        {
            kind: 'type',
            description: 'the type rejects an attribute of another type',
            value: otherType('partNum'),
            rejects: true,
        },
    ],
};

const shopNamespace = 'urn:example:shop';
const commonNamespace = 'urn:example:common';
const includeImport: Scenario = {
    id: 'include-import',
    feature: 'XSD: include and import',
    xsdOnly: true,
    schema: {
        files: {
            '/schemas/shop/order.xsd': xsd(
                [
                    '<xs:include schemaLocation="types.xsd"/>',
                    `<xs:import namespace="${commonNamespace}" schemaLocation="../common/address.xsd"/>`,
                    '<xs:element name="order">',
                    '  <xs:complexType>',
                    '    <xs:sequence>',
                    '      <xs:element ref="c:address"/>',
                    '      <xs:element name="line" type="Line" maxOccurs="unbounded"/>',
                    '    </xs:sequence>',
                    '  </xs:complexType>',
                    '</xs:element>',
                ],
                shopNamespace,
                { c: commonNamespace }
            ),
            '/schemas/shop/types.xsd': xsd(
                [
                    '<xs:complexType name="Line">',
                    '  <xs:sequence>',
                    '    <xs:element name="sku" type="xs:string"/>',
                    '    <xs:element name="qty" type="xs:positiveInteger"/>',
                    '  </xs:sequence>',
                    '</xs:complexType>',
                ],
                shopNamespace
            ),
            '/schemas/common/address.xsd': xsd(
                [
                    '<xs:element name="address">',
                    '  <xs:complexType>',
                    '    <xs:sequence>',
                    '      <xs:element name="city" type="xs:string"/>',
                    '      <xs:element name="country" type="Country"/>',
                    '    </xs:sequence>',
                    '  </xs:complexType>',
                    '</xs:element>',
                    '<xs:simpleType name="Country">',
                    '  <xs:restriction base="xs:string">',
                    '    <xs:enumeration value="US"/>',
                    '    <xs:enumeration value="CA"/>',
                    '  </xs:restriction>',
                    '</xs:simpleType>',
                ],
                commonNamespace
            ),
        },
        entry: '/schemas/shop/order.xsd',
        element: 'order',
    },
    documents: {
        order: `<order xmlns="${shopNamespace}" xmlns:c="${commonNamespace}"><c:address><c:city>Toronto</c:city><c:country>CA</c:country></c:address><line><sku>A-1</sku><qty>2</qty></line></order>`,
        badCountry: `<order xmlns="${shopNamespace}" xmlns:c="${commonNamespace}"><c:address><c:city>Toronto</c:city><c:country>MX</c:country></c:address><line><sku>A-1</sku><qty>2</qty></line></order>`,
        badQuantity: `<order xmlns="${shopNamespace}" xmlns:c="${commonNamespace}"><c:address><c:city>Toronto</c:city><c:country>CA</c:country></c:address><line><sku>A-1</sku><qty>0</qty></line></order>`,
    },
    subject: 'order',
    probes: [
        {
            kind: 'value',
            description: 'reads elements from the imported and included files',
            document: 'order',
            check: leavesInclude('Toronto', 'CA', 'A-1'),
        },
        typeMatches,
        rejects('rejects a value outside an imported enumeration', 'badCountry'),
        rejects('rejects a value outside an included type', 'badQuantity'),
    ],
};

const extension: Scenario = {
    id: 'extension',
    feature: 'XSD: extension',
    xsdOnly: true,
    schema: {
        files: {
            '/schemas/employee.xsd': xsd([
                '<xs:element name="employee" type="Employee"/>',
                '<xs:complexType name="Person">',
                '  <xs:sequence>',
                '    <xs:element name="name" type="xs:string"/>',
                '  </xs:sequence>',
                '  <xs:attribute name="id" type="xs:string" use="required"/>',
                '</xs:complexType>',
                '<xs:complexType name="Employee">',
                '  <xs:complexContent>',
                '    <xs:extension base="Person">',
                '      <xs:sequence>',
                '        <xs:element name="department" type="xs:string"/>',
                '      </xs:sequence>',
                '      <xs:attribute name="manager" type="xs:boolean"/>',
                '    </xs:extension>',
                '  </xs:complexContent>',
                '</xs:complexType>',
            ]),
        },
        entry: '/schemas/employee.xsd',
        element: 'employee',
    },
    documents: {
        employee:
            '<employee id="e-1" manager="true"><name>Ada</name><department>Research</department></employee>',
        missingBase: '<employee id="e-1"><department>Research</department></employee>',
        reversed: '<employee id="e-1"><department>Research</department><name>Ada</name></employee>',
    },
    subject: 'employee',
    probes: [
        {
            kind: 'value',
            description: 'reads the base type’s content and the extension’s',
            document: 'employee',
            check: leavesInclude('e-1', 'Ada', 'Research'),
        },
        typeMatches,
        rejects('rejects a missing element of the base type', 'missingBase'),
        rejects('rejects the extension’s elements before the base’s', 'reversed'),
    ],
};

const restriction: Scenario = {
    id: 'restriction',
    feature: 'XSD: restriction',
    xsdOnly: true,
    schema: {
        files: {
            '/schemas/shipment.xsd': xsd([
                '<xs:element name="shipment" type="Shipment"/>',
                '<xs:complexType name="Package">',
                '  <xs:sequence>',
                '    <xs:element name="weight" type="xs:decimal"/>',
                '    <xs:element name="insurance" type="xs:decimal" minOccurs="0"/>',
                '  </xs:sequence>',
                '</xs:complexType>',
                '<xs:complexType name="Shipment">',
                '  <xs:complexContent>',
                '    <xs:restriction base="Package">',
                '      <xs:sequence>',
                '        <xs:element name="weight" type="Weight"/>',
                '      </xs:sequence>',
                '    </xs:restriction>',
                '  </xs:complexContent>',
                '</xs:complexType>',
                '<xs:simpleType name="Weight">',
                '  <xs:restriction base="xs:decimal">',
                '    <xs:minExclusive value="0"/>',
                '    <xs:fractionDigits value="2"/>',
                '  </xs:restriction>',
                '</xs:simpleType>',
            ]),
        },
        entry: '/schemas/shipment.xsd',
        element: 'shipment',
    },
    documents: {
        shipment: '<shipment><weight>2.50</weight></shipment>',
        removed: '<shipment><weight>2.50</weight><insurance>100</insurance></shipment>',
        zero: '<shipment><weight>0</weight></shipment>',
        tooPrecise: '<shipment><weight>1.234</weight></shipment>',
    },
    subject: 'shipment',
    probes: [
        accepts('accepts a value inside the restriction', 'shipment'),
        typeMatches,
        rejects('rejects an element the restriction removed', 'removed'),
        rejects('rejects a value past minExclusive', 'zero'),
        rejects('rejects a value past fractionDigits', 'tooPrecise'),
    ],
};

const groups: Scenario = {
    id: 'groups',
    feature: 'XSD: groups',
    xsdOnly: true,
    schema: {
        files: {
            '/schemas/customer.xsd': xsd([
                '<xs:group name="Contact">',
                '  <xs:sequence>',
                '    <xs:element name="email" type="xs:string"/>',
                '    <xs:element name="phone" type="xs:string" minOccurs="0"/>',
                '  </xs:sequence>',
                '</xs:group>',
                '<xs:attributeGroup name="Audit">',
                '  <xs:attribute name="created" type="xs:date" use="required"/>',
                '  <xs:attribute name="by" type="xs:string"/>',
                '</xs:attributeGroup>',
                '<xs:element name="customer">',
                '  <xs:complexType>',
                '    <xs:sequence>',
                '      <xs:element name="name" type="xs:string"/>',
                '      <xs:group ref="Contact"/>',
                '    </xs:sequence>',
                '    <xs:attributeGroup ref="Audit"/>',
                '  </xs:complexType>',
                '</xs:element>',
            ]),
        },
        entry: '/schemas/customer.xsd',
        element: 'customer',
    },
    documents: {
        customer:
            '<customer created="2026-11-01" by="jo"><name>Lin</name><email>lin@example.com</email></customer>',
        missingGroupElement: '<customer created="2026-11-01"><name>Lin</name></customer>',
        missingGroupAttribute:
            '<customer><name>Lin</name><email>lin@example.com</email></customer>',
    },
    subject: 'customer',
    probes: [
        {
            kind: 'value',
            description: 'reads elements and attributes from groups',
            document: 'customer',
            check: leavesInclude('2026-11-01', 'jo', 'Lin', 'lin@example.com'),
        },
        typeMatches,
        rejects('rejects a missing element of a group', 'missingGroupElement'),
        rejects('rejects a missing attribute of an attribute group', 'missingGroupAttribute'),
    ],
};

const simpleContent: Scenario = {
    id: 'simple-content',
    feature: 'XSD: simpleContent',
    xsdOnly: true,
    schema: {
        files: {
            '/schemas/price.xsd': xsd([
                '<xs:element name="price">',
                '  <xs:complexType>',
                '    <xs:simpleContent>',
                '      <xs:extension base="Amount">',
                '        <xs:attribute name="currency" type="Currency" use="required"/>',
                '      </xs:extension>',
                '    </xs:simpleContent>',
                '  </xs:complexType>',
                '</xs:element>',
                '<xs:simpleType name="Amount">',
                '  <xs:restriction base="xs:decimal">',
                '    <xs:fractionDigits value="2"/>',
                '  </xs:restriction>',
                '</xs:simpleType>',
                '<xs:simpleType name="Currency">',
                '  <xs:restriction base="xs:string">',
                '    <xs:length value="3"/>',
                '  </xs:restriction>',
                '</xs:simpleType>',
            ]),
        },
        entry: '/schemas/price.xsd',
        element: 'price',
    },
    documents: {
        price: '<price currency="EUR">19.99</price>',
        badCurrency: '<price currency="EURO">19.99</price>',
        badAmount: '<price currency="EUR">19.999</price>',
    },
    subject: 'price',
    probes: [
        {
            kind: 'value',
            description: 'reads the text and the attribute',
            document: 'price',
            check: leavesInclude('EUR', '19.99'),
        },
        typeMatches,
        rejects('rejects an attribute past its length', 'badCurrency'),
        rejects('rejects text past its facets', 'badAmount'),
    ],
};

const envelopeNamespace = 'urn:example:envelope';
const bodyNamespace = 'urn:example:body';
const wildcard = (processContents: 'lax' | 'strict'): Scenario => ({
    id: `wildcard-${processContents}`,
    feature: `XSD: ${processContents} wildcards`,
    xsdOnly: true,
    schema: {
        files: {
            '/schemas/envelope.xsd': xsd(
                [
                    `<xs:import namespace="${bodyNamespace}" schemaLocation="body.xsd"/>`,
                    '<xs:element name="envelope">',
                    '  <xs:complexType>',
                    '    <xs:sequence>',
                    `      <xs:any namespace="##other" processContents="${processContents}"/>`,
                    '    </xs:sequence>',
                    '  </xs:complexType>',
                    '</xs:element>',
                ],
                envelopeNamespace
            ),
            '/schemas/body.xsd': xsd(
                [
                    '<xs:element name="ping">',
                    '  <xs:complexType>',
                    '    <xs:sequence>',
                    '      <xs:element name="seq" type="xs:int"/>',
                    '    </xs:sequence>',
                    '  </xs:complexType>',
                    '</xs:element>',
                ],
                bodyNamespace
            ),
        },
        entry: '/schemas/envelope.xsd',
        element: 'envelope',
    },
    documents: {
        ping: `<envelope xmlns="${envelopeNamespace}"><b:ping xmlns:b="${bodyNamespace}"><b:seq>1</b:seq></b:ping></envelope>`,
        badPing: `<envelope xmlns="${envelopeNamespace}"><b:ping xmlns:b="${bodyNamespace}"><b:seq>one</b:seq></b:ping></envelope>`,
        undeclared: `<envelope xmlns="${envelopeNamespace}"><b:pong xmlns:b="${bodyNamespace}"/></envelope>`,
    },
    subject: 'ping',
    probes: [
        accepts('accepts declared content in the wildcard', 'ping'),
        rejects('rejects invalid declared content in the wildcard', 'badPing'),
        processContents === 'strict'
            ? rejects('rejects undeclared content in the wildcard', 'undeclared')
            : accepts('accepts undeclared content in the wildcard', 'undeclared'),
    ],
});

/**
 * A schema of a record holding one element with a facet, and a value inside and outside it.
 *
 * @param id - scenario id
 * @param feature - its row
 * @param simpleType - the element's anonymous simple type
 * @param inside - a value inside the facet
 * @param outside - a value outside it
 * @returns the scenario
 */
const facet = (
    id: string,
    feature: string,
    simpleType: readonly string[],
    inside: string,
    outside: string
): Scenario => ({
    id,
    feature,
    xsdOnly: true,
    schema: {
        files: {
            [`/schemas/${id}.xsd`]: xsd([
                '<xs:element name="record">',
                '  <xs:complexType>',
                '    <xs:sequence>',
                '      <xs:element name="value">',
                ...simpleType.map(line => `        ${line}`),
                '      </xs:element>',
                '    </xs:sequence>',
                '  </xs:complexType>',
                '</xs:element>',
            ]),
        },
        entry: `/schemas/${id}.xsd`,
        element: 'record',
    },
    documents: {
        inside: `<record><value>${inside}</value></record>`,
        outside: `<record><value>${outside}</value></record>`,
    },
    subject: 'inside',
    probes: [
        accepts('accepts a value inside the facet', 'inside'),
        rejects('rejects a value outside the facet', 'outside'),
    ],
});

const dateFacet = facet(
    'date-facet',
    'XSD: date range facets',
    [
        '<xs:simpleType>',
        '  <xs:restriction base="xs:date">',
        '    <xs:minInclusive value="2026-01-01"/>',
        '  </xs:restriction>',
        '</xs:simpleType>',
    ],
    '2026-06-01',
    '2025-12-31'
);

const listFacet = facet(
    'list-facet',
    'XSD: list facets',
    [
        '<xs:simpleType>',
        '  <xs:restriction>',
        '    <xs:simpleType>',
        '      <xs:list itemType="xs:token"/>',
        '    </xs:simpleType>',
        '    <xs:maxLength value="3"/>',
        '  </xs:restriction>',
        '</xs:simpleType>',
    ],
    'red green blue',
    'red green blue black'
);

const xsiNamespace = 'http://www.w3.org/2001/XMLSchema-instance';
const polymorphism: Scenario = {
    id: 'xsi-type',
    feature: 'XSD: xsi:type',
    xsdOnly: true,
    schema: {
        files: {
            '/schemas/drawing.xsd': xsd([
                '<xs:element name="drawing">',
                '  <xs:complexType>',
                '    <xs:sequence>',
                '      <xs:element name="shape" type="Shape" maxOccurs="unbounded"/>',
                '    </xs:sequence>',
                '  </xs:complexType>',
                '</xs:element>',
                '<xs:complexType name="Shape" abstract="true">',
                '  <xs:attribute name="id" type="xs:string"/>',
                '</xs:complexType>',
                '<xs:complexType name="Circle">',
                '  <xs:complexContent>',
                '    <xs:extension base="Shape">',
                '      <xs:sequence>',
                '        <xs:element name="radius" type="xs:decimal"/>',
                '      </xs:sequence>',
                '    </xs:extension>',
                '  </xs:complexContent>',
                '</xs:complexType>',
            ]),
        },
        entry: '/schemas/drawing.xsd',
        element: 'drawing',
    },
    documents: {
        circle: `<drawing xmlns:xsi="${xsiNamespace}"><shape xsi:type="Circle" id="c-1"><radius>2</radius></shape></drawing>`,
        badRadius: `<drawing xmlns:xsi="${xsiNamespace}"><shape xsi:type="Circle" id="c-1"><radius>big</radius></shape></drawing>`,
    },
    subject: 'circle',
    probes: [
        accepts('accepts a derived type named by xsi:type', 'circle'),
        rejects('rejects invalid content of the derived type', 'badRadius'),
    ],
};

const substitution: Scenario = {
    id: 'substitution-group',
    feature: 'XSD: substitution groups',
    xsdOnly: true,
    schema: {
        files: {
            '/schemas/zoo.xsd': xsd([
                '<xs:element name="zoo">',
                '  <xs:complexType>',
                '    <xs:sequence>',
                '      <xs:element ref="animal" maxOccurs="unbounded"/>',
                '    </xs:sequence>',
                '  </xs:complexType>',
                '</xs:element>',
                '<xs:element name="animal" type="xs:string" abstract="true"/>',
                '<xs:element name="lion" type="xs:string" substitutionGroup="animal"/>',
            ]),
        },
        entry: '/schemas/zoo.xsd',
        element: 'zoo',
    },
    documents: {
        lion: '<zoo><lion>Leo</lion></zoo>',
        abstract: '<zoo><animal>Leo</animal></zoo>',
    },
    subject: 'lion',
    probes: [
        accepts('accepts a member of the substitution group', 'lion'),
        rejects('rejects the abstract head of the group', 'abstract'),
    ],
};

const identity: Scenario = {
    id: 'identity',
    feature: 'XSD: identity constraints',
    xsdOnly: true,
    schema: {
        files: {
            '/schemas/catalog.xsd': xsd([
                '<xs:element name="catalog">',
                '  <xs:complexType>',
                '    <xs:sequence>',
                '      <xs:element name="product" maxOccurs="unbounded">',
                '        <xs:complexType>',
                '          <xs:attribute name="sku" type="xs:string" use="required"/>',
                '        </xs:complexType>',
                '      </xs:element>',
                '    </xs:sequence>',
                '  </xs:complexType>',
                '  <xs:unique name="uniqueSku">',
                '    <xs:selector xpath="product"/>',
                '    <xs:field xpath="@sku"/>',
                '  </xs:unique>',
                '</xs:element>',
            ]),
        },
        entry: '/schemas/catalog.xsd',
        element: 'catalog',
    },
    documents: {
        distinct: '<catalog><product sku="A"/><product sku="B"/></catalog>',
        duplicate: '<catalog><product sku="A"/><product sku="A"/></catalog>',
    },
    subject: 'distinct',
    probes: [
        accepts('accepts distinct keys', 'distinct'),
        rejects('rejects a duplicate xs:unique key', 'duplicate'),
    ],
};

/**
 * Every scenario, in the order the report shows them.
 *
 * @param files - the secret files the security documents point at
 * @returns every scenario, in order
 */
export const scenarios = (files: SecretFiles): readonly Scenario[] => [
    repeated,
    optional,
    attributes,
    namespaces,
    mixed,
    order,
    numbers,
    security(files),
    invalid,
    locations,
    types,
    includeImport,
    extension,
    restriction,
    groups,
    simpleContent,
    wildcard('lax'),
    wildcard('strict'),
    dateFacet,
    listFacet,
    polymorphism,
    substitution,
    identity,
];
