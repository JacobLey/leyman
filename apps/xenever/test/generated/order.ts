import { x } from 'xenever';

/**
 * The type `{urn:example:order}Status`.
 */
export type Status = 'open' | 'shipped';
export const Status = x.token({ enumeration: ['open', 'shipped'] });

/**
 * The type `{urn:example:order}Tags`.
 */
export type Tags = string[];
export const Tags = x.list(x.ncName());

/**
 * The type `{urn:example:order}USState`.
 */
export type USState = 'AK' | 'AL' | 'CA';
export const USState = x.string({ enumeration: ['AK', 'AL', 'CA'] });

/**
 * The type `{urn:example:order}Zip`.
 */
export type Zip = number | string;
export const Zip = x.union([x.int(), x.string({ pattern: '\\d{5}-\\d{4}' })]);

/**
 * The type `{urn:example:order}Address`.
 */
export interface Address {
    attributes: { country: string };
    children: { name: string; street: string[]; city: string; state: USState; zip: Zip };
}
export const Address = x.complex({
    attributes: [x.attribute('country', x.nmtoken(), { fixed: 'US' })],
    content: x.sequence([
        x.element('name', x.string(), { namespace: 'urn:example:order' }),
        x.element('street', x.string(), { namespace: 'urn:example:order', maxOccurs: 'unbounded' }),
        x.element('city', x.string(), { namespace: 'urn:example:order' }),
        x.element('state', USState, { namespace: 'urn:example:order' }),
        x.element('zip', Zip, { namespace: 'urn:example:order' }),
    ]),
});

/**
 * The type `{urn:example:order}SKU`.
 */
export type SKU = string;
export const SKU = x.string({ pattern: '\\d{3}-[A-Z]{2}' });

/**
 * The type `{urn:example:order}Currency`.
 */
export type Currency = 'USD' | 'EUR';
export const Currency = x.string({ enumeration: ['USD', 'EUR'] });

/**
 * The type `{urn:example:order}Amount`.
 */
export type Amount = string;
export const Amount = x.decimal({ fractionDigits: 2, minInclusive: '0' });

/**
 * The type `{urn:example:order}Price`.
 */
export interface Price {
    attributes: { currency: Currency };
    text: Amount;
}
export const Price = x.complex({
    attributes: [x.attribute('currency', Currency, { use: 'required' })],
    text: Amount,
});

/**
 * The type `{urn:example:order}Items`.
 */
export interface Items {
    attributes: x.NoProperties;
    children: {
        item?: {
            attributes: { partNum: SKU };
            children: { productName: string; quantity: number; price: Price; shipDate?: string };
        }[];
    };
}
export const Items = x.complex({
    content: x.sequence([
        x.element(
            'item',
            x.complex({
                attributes: [x.attribute('partNum', SKU, { use: 'required' })],
                content: x.sequence([
                    x.element('productName', x.string(), { namespace: 'urn:example:order' }),
                    x.element('quantity', x.positiveInteger({ maxExclusive: 100 }), {
                        namespace: 'urn:example:order',
                    }),
                    x.element('price', Price, { namespace: 'urn:example:order' }),
                    x.element('shipDate', x.date(), {
                        namespace: 'urn:example:order',
                        minOccurs: 0,
                    }),
                ]),
            }),
            { namespace: 'urn:example:order', minOccurs: 0, maxOccurs: 'unbounded' }
        ),
    ]),
});

/**
 * The type `{urn:example:order}Note`.
 */
export interface Note {
    attributes: x.NoProperties;
    children: ({ name: '#text'; value: string } | { name: 'em'; value: string })[];
}
export const Note = x.complex({
    content: x.sequence([
        x.element('em', x.string(), {
            namespace: 'urn:example:order',
            minOccurs: 0,
            maxOccurs: 'unbounded',
        }),
    ]),
    mixed: true,
});

/**
 * The type `{urn:example:order}PurchaseOrderType`.
 */
export interface PurchaseOrderType {
    attributes: {
        orderDate: string;
        status: Status;
        version: string;
        tags?: Tags;
        '#any'?: x.XmlAttribute[];
    };
    children:
        | {
              shipTo: Address;
              billTo?: Address;
              comment?: string | null;
              giftWrap: boolean;
              plain?: never;
              items: Items;
              note?: Note[];
              '#any'?: x.XmlNode[];
          }
        | {
              shipTo: Address;
              billTo?: Address;
              comment?: string | null;
              giftWrap?: never;
              plain: { attributes: x.NoProperties };
              items: Items;
              note?: Note[];
              '#any'?: x.XmlNode[];
          };
}
export const PurchaseOrderType = x.complex({
    attributes: [
        x.attribute('orderDate', x.date(), { use: 'required' }),
        x.attribute('status', Status, { default: 'open' }),
        x.attribute('version', x.token(), { fixed: '1.0' }),
        x.attribute('tags', Tags),
        x.anyAttribute({ notNamespace: ['urn:example:order', null], processContents: 'skip' }),
    ],
    content: x.sequence([
        x.element('shipTo', Address, { namespace: 'urn:example:order' }),
        x.element('billTo', Address, { namespace: 'urn:example:order', minOccurs: 0 }),
        x.element('comment', x.string(), {
            namespace: 'urn:example:order',
            nillable: true,
            minOccurs: 0,
        }),
        x.choice([
            x.element('giftWrap', x.boolean(), { namespace: 'urn:example:order' }),
            x.element('plain', x.complex(), { namespace: 'urn:example:order' }),
        ]),
        x.element('items', Items, { namespace: 'urn:example:order' }),
        x.element('note', Note, { namespace: 'urn:example:order', minOccurs: 0, maxOccurs: 2 }),
        x.any({
            notNamespace: ['urn:example:order', null],
            processContents: 'skip',
            minOccurs: 0,
            maxOccurs: 'unbounded',
        }),
    ]),
});

/**
 * The element `{urn:example:order}purchaseOrder`.
 */
export type PurchaseOrder = PurchaseOrderType;
export const purchaseOrder: x.ElementSchema<'purchaseOrder', PurchaseOrder> = x.element(
    'purchaseOrder',
    PurchaseOrderType,
    { namespace: 'urn:example:order' }
);

/**
 * The element `{urn:example:order}comment`.
 */
export type Comment = string | null;
export const comment: x.ElementSchema<'comment', Comment> = x.element('comment', x.string(), {
    namespace: 'urn:example:order',
    nillable: true,
});
