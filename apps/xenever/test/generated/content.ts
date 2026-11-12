import { x } from 'xenever';

/**
 * The type `{urn:example:content}Repeated`.
 */
export interface Repeated {
    attributes: x.NoProperties;
    children: { a?: string[]; b?: number[] };
}
export const Repeated = x.complex({
    content: x.choice([x.element('a', x.string()), x.element('b', x.int())], {
        maxOccurs: 'unbounded',
    }),
});

/**
 * The type `{urn:example:content}Shapes`.
 */
export interface Shapes {
    attributes: { lang?: string | '' };
    children:
        | {
              first?: string;
              second?: string;
              left: string;
              right?: never;
              both?: never;
              up?: boolean;
              '#any': x.XmlNode[];
          }
        | {
              first?: string;
              second?: string;
              left: string;
              right?: never;
              both?: string[];
              up?: never;
              '#any': x.XmlNode[];
          }
        | {
              first?: string;
              second?: string;
              left?: never;
              right: string;
              both: string[];
              up?: boolean;
              '#any': x.XmlNode[];
          }
        | {
              first?: string;
              second?: string;
              left?: never;
              right: string;
              both: string[];
              up?: never;
              '#any': x.XmlNode[];
          };
}
export const Shapes = x.complex({
    attributes: [
        x.attribute('lang', x.union([x.language(), x.string({ enumeration: [''] })]), {
            namespace: 'http://www.w3.org/XML/1998/namespace',
        }),
    ],
    content: x.sequence([
        x.sequence(
            [x.element('first', x.string()), x.element('second', x.string(), { minOccurs: 0 })],
            { minOccurs: 0 }
        ),
        x.choice([
            x.element('left', x.string()),
            x.sequence([x.element('right', x.string()), x.element('both', x.string())]),
        ]),
        x.choice([x.element('up', x.boolean()), x.element('both', x.string())], { minOccurs: 0 }),
        x.any({
            notNamespace: ['urn:example:content', null],
            processContents: 'lax',
            declarations: () => [],
        }),
    ]),
});

/**
 * The type `{urn:example:content}Small`.
 */
export type Small = 1 | -2;
export const Small = x.int({ enumeration: [1, -2] });

/**
 * The type `{urn:example:content}Branches`.
 */
export interface Branches {
    attributes: x.NoProperties;
    children: { same: Small[]; other?: never } | { same: Small[]; other: string };
}
export const Branches = x.complex({
    content: x.choice([
        x.element('same', Small),
        x.sequence([x.element('same', Small, { maxOccurs: 2 }), x.element('other', x.string())]),
    ]),
});

/**
 * The type `{urn:example:content}Mixed`.
 */
export interface Mixed {
    attributes: x.NoProperties;
    children: (
        | { name: '#text'; value: string }
        | { name: 'b'; value: string }
        | { name: '#any'; value: x.XmlNode }
    )[];
}
export const Mixed = x.complex({
    content: x.sequence([
        x.element('b', x.string(), { minOccurs: 0 }),
        x.any({
            notNamespace: ['urn:example:content', null],
            processContents: 'skip',
            minOccurs: 0,
        }),
    ]),
    mixed: true,
});

/**
 * The type `{urn:example:content}Odd`.
 */
export type Odd = number;
export const Odd = x.double({ enumeration: [Number.NaN, -0] });

/**
 * The type `{urn:example:content}Positive`.
 */
export type Positive = number;
export const Positive = x.float({
    minExclusive: Number.NEGATIVE_INFINITY,
    maxInclusive: Number.POSITIVE_INFINITY,
});

/**
 * The type `{urn:example:content}Measure`.
 */
export interface Measure {
    attributes: { unit: string };
    text: string;
}
export const Measure = x.complex({
    attributes: [x.attribute('unit', x.token(), { use: 'required' })],
    text: x.decimal(),
});

/**
 * The type `{urn:example:content}Length`.
 */
export interface Length {
    attributes: { unit: string };
    text: string;
}
export const Length = x.complex({
    attributes: [x.attribute('unit', x.token(), { use: 'required' })],
    text: x.decimal({ maxInclusive: '10' }),
});

/**
 * The type `{urn:example:content}Values`.
 */
export type Values = (number | boolean)[];
export const Values = x.list(x.union([x.int(), x.boolean()]));

/**
 * The element `{urn:example:content}anything`.
 */
export type Anything = {
    attributes: { '#any'?: x.XmlAttribute[] };
    children: ({ name: '#text'; value: string } | { name: '#any'; value: x.XmlNode })[];
};
export const anything: x.ElementSchema<'anything', Anything> = x.element(
    'anything',
    x.complex({
        mixed: true,
        attributes: [
            x.anyAttribute({
                processContents: 'lax',
                declarations: () => [
                    x.attribute('lang', x.union([x.language(), x.string({ enumeration: [''] })]), {
                        namespace: 'http://www.w3.org/XML/1998/namespace',
                    }),
                    x.attribute('space', x.ncName({ enumeration: ['default', 'preserve'] }), {
                        namespace: 'http://www.w3.org/XML/1998/namespace',
                    }),
                    x.attribute('base', x.anyUri(), {
                        namespace: 'http://www.w3.org/XML/1998/namespace',
                    }),
                    x.attribute('id', x.id(), {
                        namespace: 'http://www.w3.org/XML/1998/namespace',
                    }),
                ],
            }),
        ],
        content: x.sequence([
            x.any({
                processContents: 'lax',
                declarations: () => [anything, content],
                minOccurs: 0,
                maxOccurs: 'unbounded',
            }),
        ]),
    }),
    { namespace: 'urn:example:content' }
);

/**
 * The element `{urn:example:content}content`.
 */
export type Content = {
    attributes: x.NoProperties;
    children: {
        repeated: Repeated;
        branches: Branches;
        shapes: Shapes[];
        mixed: Mixed;
        odd: Odd[];
        positive: Positive;
        length: Length;
        values: Values;
        empty: { attributes: x.NoProperties } | null;
    };
};
export const content: x.ElementSchema<'content', Content> = x.element(
    'content',
    x.complex({
        content: x.sequence([
            x.element('repeated', Repeated),
            x.element('branches', Branches),
            x.element('shapes', Shapes, { maxOccurs: 2 }),
            x.element('mixed', Mixed),
            x.element('odd', Odd, { maxOccurs: 'unbounded' }),
            x.element('positive', Positive, { default: '1.5' }),
            x.element('length', Length),
            x.element('values', Values),
            x.element('empty', x.complex(), { nillable: true }),
        ]),
    }),
    { namespace: 'urn:example:content' }
);
