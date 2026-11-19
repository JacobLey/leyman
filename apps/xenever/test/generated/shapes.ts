import { x } from 'xenever';

/**
 * The type `{urn:example:shapes}Shape`.
 */
export interface Shape {
    attributes: { id: string };
}
export const Shape = x.complex({
    name: 'Shape',
    namespace: 'urn:example:shapes',
    abstract: true,
    attributes: [x.attribute('id', x.id(), { use: 'required' })],
});

/**
 * The type `{urn:example:shapes}Circle`.
 */
export interface Circle {
    attributes: { id: string; radius: string };
}
export const Circle = x.complex({
    name: 'Circle',
    namespace: 'urn:example:shapes',
    attributes: [
        x.attribute('id', x.id(), { use: 'required' }),
        x.attribute('radius', x.decimal(), { use: 'required' }),
    ],
});

/**
 * The type `{urn:example:shapes}Ring`.
 */
export interface Ring {
    attributes: { id: string; radius: string };
    children: { inner: string };
}
export const Ring = x.complex({
    name: 'Ring',
    namespace: 'urn:example:shapes',
    attributes: [
        x.attribute('id', x.id(), { use: 'required' }),
        x.attribute('radius', x.decimal(), { use: 'required' }),
    ],
    content: x.sequence([x.element('inner', x.decimal(), { namespace: 'urn:example:shapes' })]),
});

/**
 * The type `{urn:example:shapes}Dot`.
 */
export interface Dot {
    attributes: { id: string; radius: string };
}
export const Dot = x.complex({
    name: 'Dot',
    namespace: 'urn:example:shapes',
    attributes: [
        x.attribute('id', x.id(), { use: 'required' }),
        x.attribute('radius', x.decimal(), { use: 'required', fixed: '0' }),
    ],
});

/**
 * The type `{urn:example:shapes}Group`.
 */
export interface Group {
    attributes: { id: string };
    children: {
        member?: (
            | (Circle & { type: 'Circle' })
            | (Ring & { type: 'Ring' })
            | (Dot & { type: 'Dot' })
            | (Group & { type: 'Group' })
            | (Square & { type: 'Square' })
        )[];
    };
}
export const Group = x.complex({
    name: 'Group',
    namespace: 'urn:example:shapes',
    attributes: [x.attribute('id', x.id(), { use: 'required' })],
    content: x.sequence([
        x.element('member', Shape, {
            namespace: 'urn:example:shapes',
            minOccurs: 0,
            maxOccurs: 'unbounded',
            types: (): [
                x.ComplexOf<'Circle', Circle>,
                x.ComplexOf<'Ring', Ring>,
                x.ComplexOf<'Dot', Dot>,
                x.ComplexOf<'Group', Group>,
                x.ComplexOf<'Square', Square>,
            ] => [Circle, Ring, Dot, Group, Square],
        }),
    ]),
});

/**
 * The type `{urn:example:shapes}Square`.
 */
export interface Square {
    attributes: { id: string; side: string };
}
export const Square = x.complex({
    name: 'Square',
    namespace: 'urn:example:shapes',
    attributes: [
        x.attribute('id', x.id(), { use: 'required' }),
        x.attribute('side', x.decimal(), { use: 'required' }),
    ],
});

/**
 * The element `{urn:example:shapes}drawing`.
 */
export type Drawing = {
    attributes: x.NoProperties;
    children:
        | {
              label: string;
              title?: never;
              circle?: (
                  | (Circle & { type: 'Circle' })
                  | (Ring & { type: 'Ring' })
                  | (Dot & { type: 'Dot' })
              )[];
              square?: Square[];
              outline?:
                  | (Circle & { type: 'Circle' })
                  | (Ring & { type: 'Ring' })
                  | (Dot & { type: 'Dot' })
                  | (Group & { type: 'Group' })
                  | (Square & { type: 'Square' });
              hole?: ((Circle & { type: 'Circle' }) | (Ring & { type: 'Ring' }))[];
          }
        | {
              label?: never;
              title: string;
              circle?: (
                  | (Circle & { type: 'Circle' })
                  | (Ring & { type: 'Ring' })
                  | (Dot & { type: 'Dot' })
              )[];
              square?: Square[];
              outline?:
                  | (Circle & { type: 'Circle' })
                  | (Ring & { type: 'Ring' })
                  | (Dot & { type: 'Dot' })
                  | (Group & { type: 'Group' })
                  | (Square & { type: 'Square' });
              hole?: ((Circle & { type: 'Circle' }) | (Ring & { type: 'Ring' }))[];
          };
};
export const drawing: x.ElementSchema<'drawing', Drawing> = x.element(
    'drawing',
    x.complex({
        content: x.sequence([
            x.choice([
                x.element('label', x.string(), { namespace: 'urn:example:shapes' }),
                x.element('title', x.token(), { namespace: 'urn:example:shapes' }),
            ]),
            x.choice(
                [
                    x.element('circle', Circle, {
                        namespace: 'urn:example:shapes',
                        types: (): [x.ComplexOf<'Ring', Ring>, x.ComplexOf<'Dot', Dot>] => [
                            Ring,
                            Dot,
                        ],
                    }),
                    x.element('square', Square, { namespace: 'urn:example:shapes' }),
                ],
                { minOccurs: 0, maxOccurs: 'unbounded' }
            ),
            x.element('outline', Shape, {
                namespace: 'urn:example:shapes',
                minOccurs: 0,
                types: (): [
                    x.ComplexOf<'Circle', Circle>,
                    x.ComplexOf<'Ring', Ring>,
                    x.ComplexOf<'Dot', Dot>,
                    x.ComplexOf<'Group', Group>,
                    x.ComplexOf<'Square', Square>,
                ] => [Circle, Ring, Dot, Group, Square],
            }),
            x.element('hole', Circle, {
                namespace: 'urn:example:shapes',
                minOccurs: 0,
                maxOccurs: 'unbounded',
                types: (): [x.ComplexOf<'Ring', Ring>] => [Ring],
            }),
        ]),
    }),
    { namespace: 'urn:example:shapes' }
);

/**
 * The element `{urn:example:shapes}label`.
 */
export type Label = string;
export const label: x.ElementSchema<'label', Label> = x.element('label', x.string(), {
    namespace: 'urn:example:shapes',
});

/**
 * The element `{urn:example:shapes}title`.
 */
export type Title = string;
export const title: x.ElementSchema<'title', Title> = x.element('title', x.token(), {
    namespace: 'urn:example:shapes',
});

/**
 * The element `{urn:example:shapes}shape`.
 */
export type Shape_2 = never;
export const shape: x.ElementSchema<'shape', Shape_2> = x.element('shape', Shape, {
    namespace: 'urn:example:shapes',
    abstract: true,
    types: (): [
        x.ComplexOf<'Circle', Circle>,
        x.ComplexOf<'Ring', Ring>,
        x.ComplexOf<'Dot', Dot>,
        x.ComplexOf<'Group', Group>,
        x.ComplexOf<'Square', Square>,
    ] => [Circle, Ring, Dot, Group, Square],
});

/**
 * The element `{urn:example:shapes}circle`.
 */
export type Circle_2 =
    | (Circle & { type: 'Circle' })
    | (Ring & { type: 'Ring' })
    | (Dot & { type: 'Dot' });
export const circle: x.ElementSchema<'circle', Circle_2> = x.element('circle', Circle, {
    namespace: 'urn:example:shapes',
    types: (): [x.ComplexOf<'Ring', Ring>, x.ComplexOf<'Dot', Dot>] => [Ring, Dot],
});

/**
 * The element `{urn:example:shapes}square`.
 */
export type Square_2 = Square;
export const square: x.ElementSchema<'square', Square_2> = x.element('square', Square, {
    namespace: 'urn:example:shapes',
});
