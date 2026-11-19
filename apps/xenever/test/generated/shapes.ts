import { x } from 'xenever';

/**
 * The type `{urn:example:shapes}Shape`.
 */
export interface Shape {
    attributes: { id: string };
}
export const Shape = x.complex({ attributes: [x.attribute('id', x.id(), { use: 'required' })] });

/**
 * The type `{urn:example:shapes}Circle`.
 */
export interface Circle {
    attributes: { id: string; radius: string };
}
export const Circle = x.complex({
    attributes: [
        x.attribute('id', x.id(), { use: 'required' }),
        x.attribute('radius', x.decimal(), { use: 'required' }),
    ],
});

/**
 * The element `{urn:example:shapes}drawing`.
 */
export type Drawing = {
    attributes: x.NoProperties;
    children:
        | { label: string; title?: never; circle?: Circle[]; square?: Shape[] }
        | { label?: never; title: string; circle?: Circle[]; square?: Shape[] };
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
                    x.element('circle', Circle, { namespace: 'urn:example:shapes' }),
                    x.element('square', Shape, { namespace: 'urn:example:shapes' }),
                ],
                { minOccurs: 0, maxOccurs: 'unbounded' }
            ),
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
});

/**
 * The element `{urn:example:shapes}circle`.
 */
export type Circle_2 = Circle;
export const circle: x.ElementSchema<'circle', Circle_2> = x.element('circle', Circle, {
    namespace: 'urn:example:shapes',
});

/**
 * The element `{urn:example:shapes}square`.
 */
export type Square = Shape;
export const square: x.ElementSchema<'square', Square> = x.element('square', Shape, {
    namespace: 'urn:example:shapes',
});
