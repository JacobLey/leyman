# xenever

## 0.4.0

### Minor Changes

- df0c15d: Support `default` and `fixed` on an element with mixed content, which `loadXsd` and the CLI used to reject with `XeneverUnsupportedError`. The content must be able to be empty, or the schema is invalid. An empty element reads as a list of one `#text` entry holding the value, and with `fixed` the element may have no child elements and its text must be the value exactly, compared as written. An element with a `default` or `fixed` may now list types without `text` in `types`: an empty element read as one is checked as though it held the value as text, so it is invalid unless the type can hold it (mixed content, or whitespace in content that allows only elements).
  
  Support wildcards that allow no namespace. `namespace: []` on `x.any` or `x.anyAttribute`, which was an invalid schema, now allows nothing: an element wildcard never matches, and an attribute wildcard allows no undeclared attribute. `loadXsd` and the CLI write an XSD wildcard with an empty `namespace` list, or attribute wildcards with nothing in common, this way instead of throwing `XeneverUnsupportedError`.
- ac29b42: Support `default` and `fixed` values of types that may be a QName. Element and attribute declarations take a new `namespaces` option, the prefixes their `default` or `fixed` may use (prefix to namespace name, `''` for the default namespace), and a QName in the value resolves against it rather than against the document. A `fixed` QName is compared by namespace name and local name, whatever prefix the document writes it with, and a prefix `namespaces` doesn't bind is a `XeneverInvalidSchemaError`. `loadXsd` and the CLI fill `namespaces` in from the namespaces in scope where the value is written, instead of throwing `XeneverUnsupportedError`. They also now compare the fixed value of an attribute reference with its declaration's as values, as they already did for a restriction, so `fixed="01"` keeps an integer attribute fixed to `1`.

### Patch Changes

- 7e5c32f: Elements nested deeper than 256 are now caught by parse-xml's own depth limit instead of a separate scan of the document. The `XeneverXmlError` keeps its message and location, now has parse-xml's error as its `cause`, and a document with an earlier well-formedness error reports that one first.
- 85b7a2e: `loadXsd` and the CLI reject four more invalid schemas with `XeneverInvalidSchemaError`, as XML Schema requires: an `xml:lang` on an XSD element that is neither a language nor empty (such as `xml:lang=" "` on `xs:documentation`), a local attribute qualified by the `xsi` namespace, a `mixed` extension of an element-only type that adds no particle, and facets in a simple content restriction whose base type's text is `xs:anySimpleType`.
- 5137376: Update dependencies: @rgrove/parse-xml@5.2.0. An XML declaration with no whitespace before `standalone`, or with an empty or incomplete `encoding` or `standalone`, is now a `XeneverXmlError`, as XML 1.0 requires, and text with many carriage returns no longer parses in quadratic time.

## 0.3.0

### Minor Changes

- a802073: Support `xsi:type` and abstract types. A complex type takes a `name`, `namespace`, `key` and `abstract`, and an element a `types` option: the named complex types an `xsi:type` in the document may give it besides its own. Such an element's value has a `type`, the name of the type it was read as, and is typed as a union over them in `x.Infer` and in generated types; `x.ComplexOf` annotates the getter where a type holds an element it may be the type of. An element's `default` and `fixed` are read, and compared, as the type selected reads them, so each of its `types` needs `text`. An `xsi:type` naming a type the element doesn't list is a `XeneverValidationError`, and an element of an abstract type needs one. `loadXsd` and the CLI name every global complex type, read `abstract` instead of throwing `XeneverUnsupportedError`, and give each element the types derived from its own, honouring `block`. Elements whose type nothing derives from keep their shape; generated files gain the `name` of each named type. `xsi:type` on an element of a simple type, or naming another type on an element of `xs:anyType`, is still unsupported.
- f129fa5: Support substitution groups and abstract elements. `loadXsd` and the CLI turn a reference to the head of a substitution group into a choice of the head and the members that may stand for it, honouring `abstract`, `block` and `final`, instead of throwing `XeneverUnsupportedError`. Each member keeps its own key in `children`. An element declaration takes a new `abstract` option: such an element is an error as the root and matches nothing in a content model, and its value's type is `never`. A reference inside `xs:all` to a head with members is still unsupported.
- 83b14dd: Support identity constraints. `x.key`, `x.unique` and `x.keyref` build them, for an element's new `identity` option, and `loadXsd` and the CLI read `xs:key`, `xs:unique` and `xs:keyref` instead of throwing `XeneverUnsupportedError`. Values are compared by their type, so `01` and `1` are the same `xs:int`, and keyrefs match keys of the same element or its descendants, as XSD's node tables do. A selector or field outside the XPath subset XSD allows, or with an unbound prefix, is a `XeneverInvalidSchemaError`, and so, when `parse` first compiles a root, are two different constraints of one name among the elements it may hold, and a keyref whose `refer` names no key or unique among them with as many fields. Schemas without constraints parse as fast as before.
- 0f02347: Breaking: `loadXsd` and the CLI now give an element whose named complex type has types derived from it in the XSD those types as its `types`. Its value gains `type`, the name of the type it was read as, and its generated type becomes a union over them. Elements whose type nothing derives from keep their shape. To keep the shapes of 0.2.0, pass `unsafeIgnoreDerivedTypes: true` to `loadXsd` or `xeneverFile`, or `--unsafe-ignore-derived-types` to the CLI: elements then get no `types`, and an `xsi:type` may name only the element's own type. Either way, generated files and the loaded schema now give each named complex type its `name` and `namespace`. That changes the TypeScript type of the generated schema consts, not of the values `parse` returns, and lets an `xsi:type` name the element's own type, which 0.2.0 rejected as unsupported.

## 0.2.0

### Minor Changes

- 887057d: The CLI's check flag is now `--ci`, as in barrelify, load-populate-files and nx-lifecycle, with `--check` kept as an alias. Both, and `--no-ci`/`--no-check`, work as before.

### Patch Changes

- Updated dependencies [7951a62]
- Updated dependencies [76a52d7]
- Updated dependencies [ff005f4]
- Updated dependencies [61f7f7d]
- Updated dependencies [b250760]
- Updated dependencies [d3786ed]
- Updated dependencies [d3462ff]
  - format-file@2.0.0
  - generated-signature@0.3.3
  - parse-cwd@2.1.3
  - populate-files@2.0.0

## 0.1.0

### Minor Changes

- a62dafe: First release. `parse` checks an XML document against a schema built with the `x` builders and returns a value typed by it, and `xenever/xsd` with the `xenever` CLI generates those builders from an XSD.
