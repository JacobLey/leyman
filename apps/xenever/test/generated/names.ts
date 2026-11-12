import { x } from 'xenever';

/**
 * The type `{urn:example:names}line-item`.
 */
export interface LineItem {
    attributes: x.NoProperties;
    children: ({ name: 'sku'; value: string } | { name: 'note'; value: string })[];
}
export const LineItem = x.complex({
    content: x.choice([x.element('sku', x.token()), x.element('note', x.string())], {
        maxOccurs: 'unbounded',
    }),
    ordered: true,
});

/**
 * The type `{urn:example:names}default`.
 */
export type Default = string;
export const Default = x.string();

/**
 * The type `{urn:example:other}line-item`.
 */
export type LineItem_3 = number;
export const LineItem_3 = x.double({ enumeration: [1.5, Number.POSITIVE_INFINITY] });

/**
 * The type `{urn:example:names}catalog`.
 */
export interface Catalog {
    attributes: x.NoProperties;
    children: { 'line-item': LineItem[]; default?: Default; other?: LineItem_3; count: bigint };
}
export const Catalog = x.complex({
    content: x.sequence([
        x.element('line-item', LineItem, { maxOccurs: 'unbounded' }),
        x.element('default', Default, { minOccurs: 0 }),
        x.element('other', LineItem_3, { minOccurs: 0 }),
        x.element('count', x.integer({ bigint: true })),
    ]),
});

/**
 * The type `{urn:example:names}line.item`.
 */
export type LineItem_2 = -5n | 9007199254740993n;
export const LineItem_2 = x.long({ bigint: true, enumeration: ['-5', '9007199254740993'] });

/**
 * The element `{urn:example:names}catalog`.
 */
export type Catalog_2 = Catalog;
export const catalog: x.ElementSchema<'catalog', Catalog_2> = x.element('catalog', Catalog, {
    namespace: 'urn:example:names',
});

/**
 * The element `{urn:example:names}class`.
 */
export type Class = string;
export const class_2: x.ElementSchema<'class', Class> = x.element('class', x.string(), {
    namespace: 'urn:example:names',
});

/**
 * The element `{urn:example:names}x`.
 */
export type X = LineItem_2;
export const x_2: x.ElementSchema<'x', X> = x.element('x', LineItem_2, {
    namespace: 'urn:example:names',
});
