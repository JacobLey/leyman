# xenever

Parse XML into typed objects, validated against a schema written in TypeScript or generated from an XSD.

Not yet published: the API is being built. The design is the XML counterpart of [genever](../genever/ts/): the schema decides the shape of every value (which children repeat, which are optional, which keep their order), so nothing is guessed from the document.

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

Files are only ever read from local paths, through `readFile`, which defaults to the file system. A `schemaLocation` that is a URL needs a `catalog` entry, and nothing is fetched. The XML namespace (`xml:lang` and the rest) is built in.

The options:

- `readFile`: reads a file.
- `onRead`: is called with each file read, for example to hash the inputs.
- `catalog`: maps a location or namespace to a local path.
- `bigint`: makes `xs:integer`, `xs:long` and the other big integer types `bigint`.
- `ordered`: lists the complex types, or elements with an anonymous type, whose children keep their order. Names use Clark notation, `{namespace}local`.

The loader is strict. A construct outside the supported subset throws `XeneverUnsupportedError`. Unsupported constructs include substitution groups, abstract declarations, `xs:redefine`, identity constraints, notations, chameleon includes and XSD 1.1. A schema that breaks the XML Schema rules throws `XeneverInvalidSchemaError`. Both errors carry the `filePath`, `line`, `column` and `path` of the construct. Wildcard content is always kept unvalidated, as `processContents="skip"` does.

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
export const order: x.ElementOf<'order', Order_2> = x.element('order', Order);
```

and `parse(xml, order)` returns an `Order`. Types are printed rather than left for TypeScript to infer from the builders. That keeps large schemas quick to type-check, and lets a recursive schema type-check at all.

Names come from the XSD. Types are PascalCase and element consts camelCase. When two names would collide (above, the element `order` and the type `Order`), or a name is a reserved word, later ones get `_2`, `_3` and so on, in document order. The same XSD always gives the same file.

The options:

- `-o <path>`: where to write the file, instead of next to the XSD.
- `--check`: fail if the file is out of date, without writing it. This is on by default in CI.
- `--dry-run`: don't write the file.
- `--signed`: sign the file with [`generated-signature`](../../tools/generated-signature/ts/), and refuse to overwrite it once someone edits it. `--force` overwrites it anyway.
- `--manifest <path>`: record the file in a manifest, with a hash of every XSD read.
- `--bigint` and `--ordered <name>`: the `loadXsd` options of the same name. Repeat `--ordered` for each type.
- `--catalog <location>=<path>`: a local path for a `schemaLocation` or import namespace. Repeat it for each one.

The same is available as an API, from `xenever/xsd`: `xeneverFile(path, options)` writes the file, and `generate(set)` returns the TypeScript for a schema set without touching the disk.
