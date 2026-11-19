---
"xenever": patch
---

`loadXsd` and the CLI reject four more invalid schemas with `XeneverInvalidSchemaError`, as XML Schema requires: an `xml:lang` on an XSD element that is neither a language nor empty (such as `xml:lang=" "` on `xs:documentation`), a local attribute qualified by the `xsi` namespace, a `mixed` extension of an element-only type that adds no particle, and facets in a simple content restriction whose base type's text is `xs:anySimpleType`.
