# xenever

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
