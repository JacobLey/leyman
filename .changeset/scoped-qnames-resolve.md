---
"xenever": minor
---

Support `default` and `fixed` values of types that may be a QName. Element and attribute declarations take a new `namespaces` option, the prefixes their `default` or `fixed` may use (prefix to namespace name, `''` for the default namespace), and a QName in the value resolves against it rather than against the document. A `fixed` QName is compared by namespace name and local name, whatever prefix the document writes it with, and a prefix `namespaces` doesn't bind is a `XeneverInvalidSchemaError`. `loadXsd` and the CLI fill `namespaces` in from the namespaces in scope where the value is written, instead of throwing `XeneverUnsupportedError`. They also now compare the fixed value of an attribute reference with its declaration's as values, as they already did for a restriction, so `fixed="01"` keeps an integer attribute fixed to `1`.
