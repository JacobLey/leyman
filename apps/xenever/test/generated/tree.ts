import { x } from 'xenever';

/**
 * The type `Node`.
 */
export interface Node {
    attributes: { label: string };
    children: { node?: Node[] };
}
export const Node = x.complex({
    name: 'Node',
    attributes: [x.attribute('label', x.string(), { use: 'required' })],
    content: x.sequence([
        x.lazy((): x.ElementOf<'node', Node> => x.element('node', Node), {
            minOccurs: 0,
            maxOccurs: 'unbounded',
        }),
    ]),
});

/**
 * The element `tree`.
 */
export type Tree = Node;
export const tree: x.ElementSchema<'tree', Tree> = x.element('tree', Node);

/**
 * The element `outline`.
 */
export type Outline = {
    attributes: x.NoProperties;
    children: { title: string; outline?: Outline[] };
};
export const outline: x.ElementSchema<'outline', Outline> = x.element(
    'outline',
    x.complex({
        content: x.sequence([
            x.element('title', x.string()),
            x.lazy((): x.ElementOf<'outline', Outline> => outline, {
                minOccurs: 0,
                maxOccurs: 'unbounded',
            }),
        ]),
    })
);
