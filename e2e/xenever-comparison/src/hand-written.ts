import type { X2jOptions } from 'fast-xml-parser';

/**
 * What a careful user of fast-xml-parser writes by hand for one schema: its options and the type of what it returns.
 */
export interface HandWritten {
    readonly options: X2jOptions;
    /**
     * TypeScript source exporting `Subject`.
     */
    readonly types: string;
}

/**
 * The repeated elements of every schema, by path, which the parser can't know without one.
 */
const arrays = new Set(['purchaseOrder.item', 'purchaseOrder.shipTo.street', 'invoice.line']);

/**
 * Options that keep attributes apart from children, match elements by local name, and keep every value as written, so
 * no number is rounded.
 */
const options: X2jOptions = {
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    // Paths as strings, such as `purchaseOrder.item`
    jPath: true,
    isArray: (_, path) => arrays.has(String(path)),
};

/**
 * Its whole-document switch, the only way to keep text and elements in order.
 */
const ordered: X2jOptions = { ...options, preserveOrder: true };

const purchaseOrder = [
    'interface Address { name: string; street: string[]; zip: string }',
    "interface Item { '@_partNum': string; productName: string; quantity: string; price: string; shipDate?: string }",
    "export type Subject = { purchaseOrder: { '@_orderDate': string; shipTo: Address; comment?: string; item: Item[] } };",
].join('\n');

const text = "type Text = { '#text': string };";

/**
 * The setup for each scenario that isn't about reading an XSD.
 */
export const handWritten: Readonly<Record<string, HandWritten>> = {
    benchmark: { options, types: purchaseOrder },
    repeated: { options, types: purchaseOrder },
    optional: { options, types: purchaseOrder },
    invalid: { options, types: purchaseOrder },
    locations: { options, types: purchaseOrder },
    types: { options, types: purchaseOrder },
    attributes: {
        options,
        types: "export type Subject = { book: { '@_id': string; '@_lang'?: string; id: string; title: { '#text': string; '@_lang'?: string } } };",
    },
    namespaces: {
        options,
        types: "export type Subject = { invoice: { number: string; line: { '@_qty': string; sku: string }[] } };",
    },
    mixed: {
        options: ordered,
        types: `${text}\nexport type Subject = [{ para: (Text | { b: [Text] } | { i: [Text] })[] }];`,
    },
    order: {
        options: ordered,
        types: `${text}\nexport type Subject = [{ route: ({ stop: [Text] } | { wait: [Text] })[] }];`,
    },
    numbers: {
        options,
        types: 'export type Subject = { reading: { amount: string; total: string; count: string; valid: string } };',
    },
    security: { options, types: 'export type Subject = { note: string };' },
};
