---
description: Install xenever, parse a document with a schema written in TypeScript, and generate the schema from an XSD.
---

# Getting started

## Install

::: code-group

```sh [npm]
npm i xenever
```

```sh [pnpm]
pnpm add xenever
```

```sh [yarn]
yarn add xenever
```

:::

::: tip
xenever is ESM only and needs Node.js 24 or later. The runtime, `xenever`, also runs in browsers. The XSD loader and the CLI, `xenever/xsd`, need Node.js.
:::

## Write a schema

A schema is built from the `x` builders, which mirror XSD: `x.element`, `x.attribute`, `x.complex` for a complex type, `x.sequence`, `x.choice` and `x.all` for its content, and one builder per built-in simple type, which takes the facets.

```ts twoslash
import { x } from 'xenever';

export const order = x.element(
    'order',
    x.complex({
        attributes: [x.attribute('id', x.token(), { use: 'required' })],
        content: x.sequence([
            x.element('note', x.string(), { minOccurs: 0 }),
            x.element(
                'item',
                x.complex({
                    attributes: [
                        x.attribute('sku', x.string({ pattern: '[A-Z]{3}-\\d+' }), { use: 'required' }),
                    ],
                    content: x.sequence([
                        x.element('quantity', x.int({ minInclusive: 1 })),
                        x.element('price', x.decimal()),
                    ]),
                }),
                { maxOccurs: 'unbounded' }
            ),
        ]),
    })
);
```

The builders return plain data, so a schema can be serialized, and its type is inferred from it.

## Parse a document

`parse` takes the XML and a global element, checks the document against it, and returns the element's value:

```ts twoslash
import { x } from 'xenever';

const order = x.element(
    'order',
    x.complex({
        attributes: [x.attribute('id', x.token(), { use: 'required' })],
        content: x.sequence([
            x.element('note', x.string(), { minOccurs: 0 }),
            x.element(
                'item',
                x.complex({
                    attributes: [x.attribute('sku', x.string(), { use: 'required' })],
                    content: x.sequence([x.element('quantity', x.int()), x.element('price', x.decimal())]),
                }),
                { maxOccurs: 'unbounded' }
            ),
        ]),
    })
);
// ---cut---
import { parse } from 'xenever';

const xml = `
<order id="A-17">
  <item sku="ABC-1"><quantity>2</quantity><price>9.50</price></item>
</order>`;

const value = parse(xml, order);
// {
//     attributes: { id: 'A-17' },
//     children: { item: [{ attributes: { sku: 'ABC-1' }, children: { quantity: 2, price: '9.5' } }] },
// }

const [first] = value.children.item;
//     ^?
```

A complex type's value is `{ attributes, children }`, and attributes and children are keyed by local name. `item` is an array because `maxOccurs` allows more than one, and `note` is an optional key, missing here. `x.int()` reads as a `number`, and `x.decimal()` as a string, so no digit is lost. `x.Infer<typeof order>` is the type of the value.

Elements of a type marked `ordered: true`, or `mixed: true`, are a list in document order instead, with text as `#text` entries:

```ts twoslash
import { parse, x } from 'xenever';

const paragraph = x.element(
    'p',
    x.complex({
        mixed: true,
        content: x.choice([x.element('b', x.string())], { minOccurs: 0, maxOccurs: 'unbounded' }),
    })
);

parse('<p>Call <b>now</b>.</p>', paragraph).children;
// [{ name: '#text', value: 'Call ' }, { name: 'b', value: 'now' }, { name: '#text', value: '.' }]
```

## Handle errors

A document that doesn't match the schema throws a `XeneverValidationError`, and one that isn't well-formed XML (or has a DTD) a `XeneverXmlError`. Both have the `line`, `column`, `offset` and `path` of the problem:

```ts twoslash
import { parse, x, XeneverValidationError } from 'xenever';

const quantity = x.element('quantity', x.int());

try {
    parse('<quantity>two</quantity>', quantity);
} catch (error) {
    if (error instanceof XeneverValidationError) {
        console.log(error.message);
        // "two" is not a valid int (at /quantity, line 1, column 1)
    }
}
```

`parse` throws the first problem it finds. Elements also implement [Standard Schema](https://standardschema.dev/), whose `validate` returns the problem as an issue rather than throwing.

## Generate the schema from an XSD

For an existing XSD, the CLI writes the schema for you, with a named type for each value:

```sh
npx xenever schemas/order.xsd
```

It reads the XSD and every file it includes and imports (from local paths only, nothing is fetched), and writes `schemas/order.ts` next to it. For this XSD:

```xml
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="order" type="Order"/>
  <xs:complexType name="Order">
    <xs:sequence>
      <xs:element name="item" type="xs:string" maxOccurs="unbounded"/>
    </xs:sequence>
    <xs:attribute name="id" type="xs:token" use="required"/>
  </xs:complexType>
</xs:schema>
```

the file holds roughly:

```ts twoslash
// @filename: order.ts
import { x } from 'xenever';

export interface Order {
    attributes: { id: string };
    children: { item: string[] };
}
export const Order = x.complex({
    attributes: [x.attribute('id', x.token(), { use: 'required' })],
    content: x.sequence([x.element('item', x.string(), { maxOccurs: 'unbounded' })]),
});

export type Order_2 = Order;
export const order: x.ElementSchema<'order', Order_2> = x.element('order', Order);

// @filename: index.ts
// ---cut---
import { parse } from 'xenever';
import { order } from './order.js';

const value = parse('<order id="A-17"><item>Lawnmower</item></order>', order);
//    ^?
```

Commit the generated file. Run the same command with `--ci` (or its alias `--check`) in CI, or anywhere [ci-info](https://www.npmjs.com/package/ci-info) detects CI, where it is on by default, and it fails when the file is out of date instead of writing it. The same XSD always gives the same file.

An XSD construct xenever doesn't support, such as `xs:redefine`, fails with its file, line and column. The `--ordered`, `--bigint` and `--catalog` options, and the same steps as an API (`loadXsd`, `generate` and `xeneverFile` in `xenever/xsd`), are in the [README](https://github.com/JacobLey/leyman/blob/main/apps/xenever/README.md#xeneverxsd).

## Next steps

- [Comparison](/packages/xenever/comparison): xenever and other XML tools run through the same schemas and documents.
- [README](https://github.com/JacobLey/leyman/blob/main/apps/xenever/README.md): every value shape, error and option.
