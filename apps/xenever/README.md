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
