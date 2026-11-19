---
"xenever": minor
---

Support identity constraints. `x.key`, `x.unique` and `x.keyref` build them, for an element's new `identity` option, and `loadXsd` and the CLI read `xs:key`, `xs:unique` and `xs:keyref` instead of throwing `XeneverUnsupportedError`. Values are compared by their type, so `01` and `1` are the same `xs:int`, and keyrefs match keys of the same element or its descendants, as XSD's node tables do. A selector or field outside the XPath subset XSD allows, or with an unbound prefix, is a `XeneverInvalidSchemaError`. Schemas without constraints parse as fast as before.
