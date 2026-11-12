import type { StandardSchemaV1 } from '@standard-schema/spec';
import { expectTypeOf } from 'expect-type';
import { suite, test } from 'mocha-chain';
import { x } from 'xenever';

/**
 * Types a declaration's value, to assert on it.
 *
 * @param declaration - an element declaration or a type
 * @returns the declaration itself at runtime, typed as the value `parse` would return
 */
const inferred = <T>(declaration: T): x.Infer<T> => declaration as never;

suite('Infer', () => {
    suite('Simple types', () => {
        test('String types are strings', () => {
            expectTypeOf<x.Infer<ReturnType<typeof x.token>>>().toEqualTypeOf<string>();
            expectTypeOf<x.Infer<ReturnType<typeof x.anyUri>>>().toEqualTypeOf<string>();
        });

        test('Number types are numbers', () => {
            expectTypeOf<x.Infer<ReturnType<typeof x.int>>>().toEqualTypeOf<number>();
            expectTypeOf<x.Infer<ReturnType<typeof x.double>>>().toEqualTypeOf<number>();
            const integer = x.integer();
            expectTypeOf(inferred(integer)).toEqualTypeOf<number>();
        });

        test('Big integer types flagged bigint are bigints', () => {
            const integer = x.integer({ bigint: true, minInclusive: 0 });
            expectTypeOf(inferred(integer)).toEqualTypeOf<bigint>();
        });

        test('Decimal, date and binary types are strings', () => {
            expectTypeOf<x.Infer<ReturnType<typeof x.decimal>>>().toEqualTypeOf<string>();
            expectTypeOf<x.Infer<ReturnType<typeof x.dateTime>>>().toEqualTypeOf<string>();
            expectTypeOf<x.Infer<ReturnType<typeof x.hexBinary>>>().toEqualTypeOf<string>();
        });

        test('Boolean is a boolean', () => {
            expectTypeOf<x.Infer<ReturnType<typeof x.boolean>>>().toEqualTypeOf<boolean>();
        });

        test('QName is a namespace and local name', () => {
            expectTypeOf<x.Infer<ReturnType<typeof x.qname>>>().toEqualTypeOf<{
                namespace: string | null;
                localName: string;
            }>();
        });

        test('Enumerations are literal unions', () => {
            const color = x.token({ enumeration: ['red', 'green'] });
            expectTypeOf(inferred(color)).toEqualTypeOf<'green' | 'red'>();
            const small = x.int({ enumeration: [1, 2] });
            expectTypeOf(inferred(small)).toEqualTypeOf<1 | 2>();
            const big = x.long({ bigint: true, enumeration: ['-5', '9007199254740993'] });
            expectTypeOf(inferred(big)).toEqualTypeOf<-5n | 9_007_199_254_740_993n>();
        });

        test('Lists are arrays', () => {
            const numbers = x.list(x.int(), { maxLength: 3 });
            expectTypeOf(inferred(numbers)).toEqualTypeOf<number[]>();
        });

        test('Unions are unions', () => {
            const mixed = x.union([x.int(), x.token({ enumeration: ['none'] })]);
            expectTypeOf(inferred(mixed)).toEqualTypeOf<'none' | number>();
        });
    });

    suite('Elements', () => {
        test('A simple-typed element is its value', () => {
            const price = x.element('price', x.decimal());
            expectTypeOf(inferred(price)).toEqualTypeOf<string>();
        });

        test('A complex type always has attributes', () => {
            const empty = x.element('empty', x.complex());
            expectTypeOf(inferred(empty)).toEqualTypeOf<{ attributes: x.NoProperties }>();
        });

        test('Attributes are optional unless required', () => {
            const item = x.element(
                'item',
                x.complex({
                    attributes: [
                        x.attribute('sku', x.token(), { use: 'required' }),
                        x.attribute('qty', x.int()),
                        x.attribute('lang', x.language(), {
                            namespace: 'http://www.w3.org/XML/1998/namespace',
                            key: 'xmlLang',
                        }),
                    ],
                })
            );
            expectTypeOf(inferred(item)).toEqualTypeOf<{
                attributes: { sku: string; qty?: number; xmlLang?: string };
            }>();
        });

        test('Text content is `text`', () => {
            const amount = x.element(
                'amount',
                x.complex({ attributes: [x.attribute('currency', x.token())], text: x.decimal() })
            );
            expectTypeOf(inferred(amount)).toEqualTypeOf<{
                attributes: { currency?: string };
                text: string;
            }>();
        });

        test('The element builder is a Standard Schema of its value', () => {
            const price = x.element('price', x.decimal());
            expectTypeOf(price).toExtend<StandardSchemaV1<string, string>>();
        });
    });

    suite('Children', () => {
        test('A sequence flattens into one object', () => {
            const order = x.element(
                'order',
                x.complex({
                    content: x.sequence([
                        x.element('id', x.token()),
                        x.element('note', x.string(), { minOccurs: 0 }),
                        x.element('item', x.int(), { maxOccurs: 'unbounded' }),
                        x.element('tag', x.token(), { minOccurs: 0, maxOccurs: 3 }),
                    ]),
                })
            );
            expectTypeOf(inferred(order)).toEqualTypeOf<{
                attributes: x.NoProperties;
                children: { id: string; item: number[]; note?: string; tag?: string[] };
            }>();
        });

        test('An occurrence inherited from a group applies to its elements', () => {
            const order = x.element(
                'order',
                x.complex({
                    content: x.sequence([
                        x.sequence([x.element('a', x.int())], { maxOccurs: 2 }),
                        x.sequence([x.element('b', x.int())], { minOccurs: 0 }),
                    ]),
                })
            );
            expectTypeOf(inferred(order)).toEqualTypeOf<{
                attributes: x.NoProperties;
                children: { a: number[]; b?: number };
            }>();
        });

        test('An element declared twice is an array', () => {
            const order = x.element(
                'order',
                x.complex({
                    content: x.sequence([
                        x.element('a', x.int(), { minOccurs: 0 }),
                        x.element('b', x.int()),
                        x.element('a', x.int()),
                    ]),
                })
            );
            expectTypeOf(inferred(order)).toEqualTypeOf<{
                attributes: x.NoProperties;
                children: { a: number[]; b: number };
            }>();
        });

        test('A choice is a union of objects', () => {
            const shape = x.element(
                'shape',
                x.complex({
                    content: x.choice([
                        x.element('circle', x.double()),
                        x.sequence([
                            x.element('width', x.double()),
                            x.element('height', x.double()),
                        ]),
                    ]),
                })
            );
            expectTypeOf(inferred(shape)).toEqualTypeOf<{
                attributes: x.NoProperties;
                children:
                    | { circle: number; width?: never; height?: never }
                    | { width: number; height: number; circle?: never };
            }>();
        });

        test('A choice in a sequence keeps keys of the sequence in each branch', () => {
            const shape = x.element(
                'shape',
                x.complex({
                    content: x.sequence([
                        x.element('id', x.token()),
                        x.choice([x.element('a', x.int()), x.element('b', x.int())], {
                            minOccurs: 0,
                        }),
                    ]),
                })
            );
            expectTypeOf(inferred(shape)).toEqualTypeOf<{
                attributes: x.NoProperties;
                children:
                    | { id: string; a?: number; b?: never }
                    | { id: string; b?: number; a?: never };
            }>();
        });

        test('A repeated choice has every key optional', () => {
            const list = x.element(
                'list',
                x.complex({
                    content: x.choice([x.element('a', x.int()), x.element('b', x.token())], {
                        maxOccurs: 'unbounded',
                    }),
                })
            );
            expectTypeOf(inferred(list)).toEqualTypeOf<{
                attributes: x.NoProperties;
                children: { a?: number[]; b?: string[] };
            }>();
        });

        test('A choice in a repeated sequence has every key optional', () => {
            const list = x.element(
                'list',
                x.complex({
                    content: x.sequence(
                        [x.choice([x.element('a', x.int()), x.element('b', x.int())])],
                        {
                            maxOccurs: 2,
                        }
                    ),
                })
            );
            expectTypeOf(inferred(list)).toEqualTypeOf<{
                attributes: x.NoProperties;
                children: { a?: number[]; b?: number[] };
            }>();
        });

        test('An element in two branches of a choice occurs once', () => {
            const pick = x.element(
                'pick',
                x.complex({
                    content: x.choice([
                        x.sequence([x.element('a', x.int()), x.element('b', x.int())]),
                        x.sequence([x.element('a', x.int()), x.element('c', x.int())]),
                    ]),
                })
            );
            expectTypeOf(inferred(pick)).toEqualTypeOf<{
                attributes: x.NoProperties;
                children: { a: number; b: number; c?: never } | { a: number; c: number; b?: never };
            }>();
        });

        test('An all group flattens like a sequence', () => {
            const project = x.element(
                'project',
                x.complex({
                    content: x.all([
                        x.element('name', x.token()),
                        x.element('url', x.anyUri(), { minOccurs: 0 }),
                    ]),
                })
            );
            expectTypeOf(inferred(project)).toEqualTypeOf<{
                attributes: x.NoProperties;
                children: { name: string; url?: string };
            }>();
        });

        test('A lazy reference takes the key and value it is annotated with', () => {
            interface Tree {
                attributes: x.NoProperties;
                children: { tree?: Tree[] };
            }
            const tree = x.element(
                'tree',
                x.complex({
                    content: x.sequence([
                        x.lazy((): x.ElementOf<'tree', Tree> => tree, {
                            minOccurs: 0,
                            maxOccurs: 'unbounded',
                        }),
                    ]),
                })
            );
            expectTypeOf(inferred(tree)).toEqualTypeOf<Tree>();
        });

        test('A lazy reference to a declaration of a known type takes its key and value', () => {
            const leaf = x.element('leaf', x.int(), { key: 'value' });
            const node = x.element(
                'node',
                x.complex({ content: x.sequence([x.lazy(() => leaf)]) })
            );
            expectTypeOf(inferred(node)).toEqualTypeOf<{
                attributes: x.NoProperties;
                children: { value: number };
            }>();
        });

        test('Particles in an array rather than a tuple give a record', () => {
            const particles: x.Particle[] = [];
            const loose = x.element('loose', x.complex({ content: x.sequence(particles) }));
            expectTypeOf(inferred(loose)).toEqualTypeOf<{
                attributes: x.NoProperties;
                children: Record<string, unknown>;
            }>();
        });
    });

    suite('As const literals', () => {
        test('Infers the same type as the builders', () => {
            const order = {
                kind: 'element',
                name: 'order',
                type: {
                    kind: 'complex',
                    attributes: [
                        { kind: 'attribute', name: 'id', type: { kind: 'int' }, use: 'required' },
                    ],
                    content: {
                        kind: 'sequence',
                        particles: [
                            {
                                kind: 'element',
                                name: 'item',
                                type: { kind: 'token', facets: { enumeration: ['a', 'b'] } },
                                maxOccurs: 'unbounded',
                            },
                        ],
                    },
                },
            } as const satisfies x.Element;
            expectTypeOf(inferred(order)).toEqualTypeOf<{
                attributes: { id: number };
                children: { item: ('a' | 'b')[] };
            }>();
        });
    });
});
