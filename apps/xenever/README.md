<div style="text-align:center">

# xenever

Parse XML into typed objects, validated against a schema written in TypeScript or generated from an XSD.

[![npm package](https://badge.fury.io/js/xenever.svg)](https://www.npmjs.com/package/xenever)
[![License](https://img.shields.io/npm/l/xenever.svg)](https://github.com/JacobLey/leyman/blob/main/apps/xenever/LICENSE)

</div>

Most XML an application reads has a schema. An invoice, a Maven POM or a bank statement comes with an XSD that says which elements repeat, which are optional, which attributes are required and what type each value is. XML parsers for JavaScript mostly leave it out: they turn the document into a tree of objects and guess its shape from the data, so an element that occurs once is an object and the same element occurring twice is an array. The result is typed as `any`, or with a type written by hand that nothing checks.

Ideally the schema decides the shape. A repeatable element is always an array, an optional one is a key that may be missing, and a decimal keeps all of its digits. The document is checked against the schema as it is read, and the TypeScript type of the result comes from the same schema.

`xenever` is a library that does this. You describe the schema with its `x` builders, or generate them from an XSD with its CLI, and `parse(xml, element)` validates the document and returns a value whose type follows the schema.

- Attributes and child elements are kept apart, in `attributes` and `children`, so an attribute and a child of the same name never collide.
- Elements match on namespace and local name, so prefixes don't matter.
- Children are keyed by name. Mixed content, and any element you choose, keep text and elements in document order instead.
- `xs:decimal` is a string, and `xs:integer` and the other big integer types are a `number` only within the safe range, or `bigint` when you ask for it. Nothing is rounded.
- A document that breaks the schema throws with the line, column and path of the problem. DTDs are rejected, so entities are never expanded.

It doesn't write XML yet, and some XSD constructs are not supported: abstract types and `xsi:type` among them. Those fail when the schema is loaded, with the construct's location. See [Limits](#limits).

Guides and the comparison with other XML tools are on the [docs site](https://jacobley.github.io/leyman/packages/xenever/).

## Contents

- [Install](#install)
- [Example](#example)
- [Values](#values)
- [Identity constraints](#identity-constraints)
- [Errors](#errors)
- [`xenever/xsd`](#xeneverxsd)
- [Generating TypeScript](#generating-typescript)
- [Limits](#limits)
- [Compared to alternatives](#compared-to-alternatives)

## Install

```sh
npm i xenever
```

It is ESM only, and needs Node.js 24 or later. The runtime (`xenever`) also runs in browsers; the XSD loader and CLI (`xenever/xsd`) need Node.js.

## Example

```ts
import { parse, x } from 'xenever';

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
                    content: x.sequence([
                        x.element('quantity', x.int()),
                        x.element('price', x.decimal()),
                    ]),
                }),
                { maxOccurs: 'unbounded' }
            ),
        ]),
    })
);

const value = parse(
    '<order id="A-17"><item sku="ABC-1"><quantity>2</quantity><price>9.50</price></item></order>',
    order
);
// {
//     attributes: { id: 'A-17' },
//     children: { item: [{ attributes: { sku: 'ABC-1' }, children: { quantity: 2, price: '9.5' } }] },
// }
```

`value` is typed from the schema: `children.note` is an optional `string`, and `children.item` an array, even though the document has one item. `x.Infer<typeof order>` is the same type.

## Values

The type of an element decides the shape of its value, whatever the document holds:

- An element of a simple type is its value: `string`, `number`, `boolean`, a literal union for an enumeration, an array for a list.
- An element of a complex type is `{ attributes }`, plus `children` when it has child elements or `text` when it has simple content. `attributes` is always there, `{}` when the type has none, so adding an attribute to a type doesn't change its shape.
- Children are keyed by local name, in declaration order. `maxOccurs` above 1 is an array, even for one occurrence, and `minOccurs="0"` is an optional key, absent when the element is. A `choice` is a union of objects.
- With `ordered: true` on the complex type, and always for `mixed`, children are a list of `{ name, value }` in document order, with `{ name: '#text', value }` for text in mixed content.
- `xs:decimal` is a canonical string (`9.50` reads as `'9.5'`). Big integer types are a `number`, and a value past `Number.MAX_SAFE_INTEGER` is an error, unless the type is `x.integer({ bigint: true })`. `float` and `double` read `INF`, `-INF` and `NaN`. Dates, times and durations stay strings as written, even when enumerated: their facets compare values, so `2026-11-12Z` matches an enumerated `2026-11-12+00:00`. A value without a timezone may be up to 14 hours either side of one with a timezone, so a range facet rejects it when that could put it on either side of the bound, and `P1M` neither is nor isn't below `P30D`.
- An element declared `abstract: true` is never in a document. It is an error as the root, matches nothing in a content model, and its value's type is `never`.
- `xsi:nil="true"` on a `nillable` element is `null`. Elements an `x.any()` wildcard matches are kept as untyped `XmlNode` trees under `'#any'`, and attributes an `x.anyAttribute()` matches as `XmlAttribute`s under `attributes['#any']`.

Unknown elements and attributes are errors. Comments and processing instructions are skipped, and whitespace between child elements is ignored. No two elements may have the same `xs:ID`, and each `xs:IDREF`, including each item of an `xs:IDREFS`, must be the ID of an element somewhere in the document.

A wildcard validates what it matches as its `processContents` says, as XSD does, while the value keeps its untyped shape. The default is `'strict'`: each element needs one of the wildcard's `declarations`, the global declarations it may match by name, and is validated against it. `'lax'` validates only the elements that have a declaration, and `'skip'` validates nothing:

```ts
const note = x.element('note', x.string());
const extensible = x.element(
    'doc',
    x.complex({
        content: x.sequence([
            x.any({ processContents: 'lax', declarations: () => [note], maxOccurs: 'unbounded' }),
        ]),
    })
);
```

`declarations` is a function, so it can name elements declared further down.

Each element built with `x.element` also implements [Standard Schema](https://standardschema.dev/) (`StandardSchemaV1<string, T>`), so a library that takes one can validate an XML string with it.

## Identity constraints

An element can declare keys, as XSD's `xs:key`, `xs:unique` and `xs:keyref` do. Each constraint selects elements below the one declaring it, with an XPath selector, and reads fields from each, which are attributes or elements of a simple type:

- `x.unique(name, selector, fields)`: the selected elements that have every field have distinct values.
- `x.key(name, selector, fields)`: the same, and every selected element has every field.
- `x.keyref(name, key, selector, fields)`: the fields of each selected element that has them all match an element the key or unique selected, in the element declaring the keyref or below it.

```ts
const sku = x.key('sku', 'item', ['@sku']);
const order = x.element(
    'order',
    x.complex({
        content: x.sequence([
            x.element('item', x.complex({ attributes: [x.attribute('sku', x.int())] }), {
                maxOccurs: 'unbounded',
            }),
            x.element('line', x.complex({ attributes: [x.attribute('sku', x.int())] }), {
                maxOccurs: 'unbounded',
            }),
        ]),
    }),
    { identity: [sku, x.keyref('lineSku', sku, 'line', ['@sku'])] }
);

parse('<order><item sku="1"/><item sku="2"/><line sku="02"/></order>', order); // valid
parse('<order><item sku="1"/><item sku="01"/><line sku="1"/></order>', order); // throws
```

Values are compared by the field's type, not as text: as `xs:int`, `01` and `1` are the same value, so the second document has a duplicate key. Paths are the XPath subset XSD allows: child steps, `.`, `*`, a leading `.//` and `|` between paths, and in a field an `@` step last. A prefixed name needs its prefix in the `namespaces` option, as unprefixed names are in no namespace. The constraints are checked once the element declaring them is read, and don't change the value's type.

## Errors

Every error extends `XeneverError`:

- `XeneverXmlError`: the document isn't well-formed XML, has a DTD, or uses an undeclared prefix.
- `XeneverValidationError`: the document doesn't match the schema.
- `XeneverInvalidSchemaError`: the schema value or XSD breaks the XML Schema rules.
- `XeneverUnsupportedError`: the XSD uses a construct xenever doesn't support.
- `XeneverLoadError`: an XSD file couldn't be read.

Document errors have `line`, `column`, `offset` and `path` (such as `/order/item[2]/quantity`), also repeated at the end of the message. `parse` throws the first problem it finds.

## `xenever/xsd`

`loadXsd` reads an XSD, along with every file it includes and imports, into the same schema values the `x` builders make. Each global element is ready for `parse`, and each named type is one shared object wherever it's used.

```ts
import { parse } from 'xenever';
import { loadXsd } from 'xenever/xsd';

const { elements, types } = await loadXsd('schemas/order.xsd', {
    catalog: { 'https://example.com/common.xsd': 'schemas/common.xsd' },
});
const order = parse(xml, elements[0]);
```

Elements and types come back in document order. The first file comes first, then the files it includes and imports, depth first. An element whose type contains itself becomes an `x.lazy` reference. Groups and attribute groups are inlined.

A reference to the head of a substitution group becomes an `x.choice`, with the reference's `minOccurs` and `maxOccurs`, of the head and every member of its group that may stand for it, in document order. An abstract head or member is left out, as are the members its `block` rules out. Each member keeps its own name as its key in `children`, so the value says which element the document used. A member must have a type derived from its head's, by a method the head's `final` allows.

Files are only ever read from local paths, through `readFile`, which defaults to the file system. A `schemaLocation` that is a URL needs a `catalog` entry, and nothing is fetched. The XML namespace (`xml:lang` and the rest) is built in.

The options:

- `readFile`: reads a file.
- `onRead`: is called with each file read, for example to hash the inputs.
- `catalog`: maps a location or namespace to a local path.
- `bigint`: makes `xs:integer`, `xs:long` and the other big integer types `bigint`.
- `ordered`: lists the complex types, or elements with an anonymous type, whose children keep their order. Names use Clark notation, `{namespace}local`.

The loader is strict. A construct outside the supported subset throws `XeneverUnsupportedError`. Unsupported constructs include abstract types, `xs:redefine`, notations, chameleon includes and XSD 1.1. A schema that breaks the XML Schema rules throws `XeneverInvalidSchemaError`. Both errors carry the `filePath`, `line`, `column` and `path` of the construct. Each wildcard keeps its `processContents`, with the schema set's global declarations as its `declarations`, so a lax or strict wildcard validates what it matches. An element declared without a type is `xs:anyType`, whose content is lax. Identity constraints keep the prefixes their paths use, from where they are written, in `namespaces`.

## Generating TypeScript

Loading an XSD at runtime gives you a schema, but not types: the compiler can't see inside a file read while the program runs. So xenever can also turn an XSD into a TypeScript file, written once and committed like any other generated code. The file holds the same schema values `loadXsd` would build, written with the `x` builders, and a named type for each value, so `parse` returns a type you can import.

```sh
xenever schemas/order.xsd
```

That writes `schemas/order.ts`, next to the XSD. For a schema like this one:

```xml
<xs:element name="order" type="Order"/>
<xs:complexType name="Order">
  <xs:sequence>
    <xs:element name="item" type="xs:string" maxOccurs="unbounded"/>
  </xs:sequence>
  <xs:attribute name="id" type="xs:token" use="required"/>
</xs:complexType>
```

the file has roughly:

```ts
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
```

and `parse(xml, order)` returns an `Order`. Types are printed rather than left for TypeScript to infer from the builders. That keeps large schemas quick to type-check, and lets a recursive schema type-check at all.

Names come from the XSD. Types are PascalCase and element consts camelCase. When two names would collide (above, the element `order` and the type `Order`), or a name is a reserved word, later ones get `_2`, `_3` and so on, in document order. The same XSD always gives the same file.

The options:

- `-o <path>`: where to write the file, instead of next to the XSD.
- `--ci` (or `--check`): fail if the file is out of date, without writing it. This is on by default in CI, and `--no-ci` turns it off there.
- `--dry-run`: don't write the file.
- `--signed`: sign the file with [`generated-signature`](https://www.npmjs.com/package/generated-signature), and refuse to overwrite it once someone edits it. `--force` overwrites it anyway.
- `--manifest <path>`: record the file in a manifest, with a hash of every XSD read.
- `--bigint` and `--ordered <name>`: the `loadXsd` options of the same name. Repeat `--ordered` for each type.
- `--catalog <location>=<path>`: a local path for a `schemaLocation` or import namespace. Repeat it for each one.

The same is available as an API, from `xenever/xsd`: `xeneverFile(path, options)` writes the file, and `generate(set)` returns the TypeScript for a schema set without touching the disk.

## Limits

Each of these fails with `XeneverUnsupportedError` when the XSD is loaded, at the construct, rather than reading documents more loosely:

- Abstract types. `xsi:type` in a document fails the same way, when it is parsed.
- A reference inside `xs:all` to an element whose substitution group has members, as `xs:all` holds elements only. Two members of one group whose names differ only by namespace, as they would share a key.
- An identity constraint whose selector and fields bind one prefix to different namespaces.
- `xs:redefine` and `xs:override`, notations, chameleon includes and XSD 1.1.
- Enumerations of binary values, QNames and unions, and of lists of them, whose values xenever has no equality for; length facets on QNames.

## Compared to alternatives

The [comparison](https://jacobley.github.io/leyman/packages/xenever/comparison) runs xenever, `@abapify/ts-xsd`, `xml-xsd-engine` and `fast-xml-parser` (with hand-written types) through the same schemas and documents every night, including the features above that xenever doesn't support.
