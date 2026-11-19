---
description: Parse XML into typed objects, validated against a schema written in TypeScript or generated from an XSD.
---

# xenever

<ProjectHeader />

Most XML an application reads has a schema. An invoice, a Maven POM or a bank statement comes with an XSD that says which elements repeat, which are optional, which attributes are required and what type each value is. XML parsers for JavaScript mostly leave it out. They turn the document into a tree of objects and guess its shape from the data, so an element that occurs once is an object and the same element occurring twice is an array, and code reading it has to handle both. Numbers too large for a double are rounded on the way, and the result is typed as `any`, or with a type written by hand that nothing checks.

Ideally the schema decides the shape. A repeatable element is always an array, an optional one is a key that may be missing, and a decimal keeps all of its digits. The document is checked against the schema as it is read, so a misspelled element is an error with a line number rather than a missing value later, and the TypeScript type of the result comes from the same schema.

xenever is a library that does this. You describe the schema with its `x` builders, or generate them from an XSD, and `parse` validates the document and returns a value typed by the schema:

```ts twoslash
import { parse, x } from 'xenever';

const order = x.element(
    'order',
    x.complex({
        attributes: [x.attribute('id', x.token(), { use: 'required' })],
        content: x.sequence([
            x.element('note', x.string(), { minOccurs: 0 }),
            x.element('price', x.decimal(), { maxOccurs: 'unbounded' }),
        ]),
    })
);

const value = parse('<order id="A-17"><price>9.50</price></order>', order);
//    ^?
// { attributes: { id: 'A-17' }, children: { price: ['9.5'] } }
```

`price` is an array even though the document has one, because the schema allows more, and `note` is optional.

**[Get started →](/packages/xenever/getting-started)**

## Features

- The shape of a value depends only on the element's type. `maxOccurs` above 1 is always an array, `minOccurs="0"` is an optional key, and attributes are kept in `attributes`, apart from child elements in `children`, so the two never collide.
- Elements match on namespace and local name, so the same document with other prefixes reads the same.
- Children are keyed by name. Mixed content, and any type you mark `ordered`, keep text and elements in document order as a list.
- `xs:decimal` is a string that keeps every digit. `xs:integer`, `xs:long` and the other big integer types are a `number` within the safe range and an error past it, or a `bigint` when you ask for one.
- Dates, times and durations stay strings as written. Their range and enumeration facets compare values as XSD orders them, timezones included, so `2026-11-12Z` matches an enumerated `2026-11-12+00:00`.
- A document that breaks the schema throws an error with the line, column and path of the problem, such as `/order/item[2]/quantity`.
- A document with a DTD is rejected, so no entity is expanded and no external file is read.
- The `xenever` CLI turns an XSD, with the files it includes and imports, into a TypeScript file of `x` builders and named types. The same XSD always gives the same file, and `--ci` fails in CI when it is out of date.
- Substitution groups, abstract types and `xsi:type` are read from the XSD. An element whose type the document may choose has a `type` in its value, to narrow its union on.
- An XSD construct xenever doesn't support fails when the schema is loaded, with its file, line and column, so a schema is never read more loosely than it says.
- Elements implement [Standard Schema](https://standardschema.dev/), with an XML string as the input.

## Limits

xenever doesn't write XML yet. `xs:redefine`, XSD 1.1 and enumerations of binary values and QNames are not supported, and fail when the XSD is loaded. `xsi:type` is not supported on an element of a simple type or of `xs:anyType`, and fails when the document is parsed.

## Compared to

Each tool is given the same schemas and documents every night, and the [comparison](/packages/xenever/comparison) shows the latest report. In a local run on 2026-11-12:

- [@abapify/ts-xsd](https://www.npmjs.com/package/@abapify/ts-xsd) 0.4.34 doesn't validate: it accepted 9 of the 10 invalid purchase orders. It reads `xs:decimal` and `xs:integer` as numbers, so `12345678901234567890.10` came back as `12345678901234567000`. Importing its `parseXml` also bundles ts-morph and TypeScript, 1.6 MB gzipped.
- [xml-xsd-engine](https://www.npmjs.com/package/xml-xsd-engine) 1.7.3 validates well, with line and column. Its `xmlToJson` turns a repeatable element that occurs once into an object rather than an array, and the TypeScript it generates for a schema with a target namespace doesn't compile.
- [fast-xml-parser](https://www.npmjs.com/package/fast-xml-parser) 5.12.0 reads no schema, so which elements are arrays, and the types, are written by hand. It checks only that a document is well-formed, and keeps text in order only with `preserveOrder`, which changes the shape of the whole document.

xenever was slower than fast-xml-parser and xml-xsd-engine in that run: 9.6 ms to parse a 145 kB purchase order, against 7.5 ms and 8.2 ms.

## Related

<ProjectRelated />
