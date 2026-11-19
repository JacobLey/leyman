---
"xenever": minor
---

Support `default` and `fixed` on an element with mixed content, which `loadXsd` and the CLI used to reject with `XeneverUnsupportedError`. The content must be able to be empty, or the schema is invalid. An empty element reads as a list of one `#text` entry holding the value, and with `fixed` the element may have no child elements and its text must be the value exactly, compared as written. An element with a `default` or `fixed` may now list types without `text` in `types`: an empty element read as one is checked as though it held the value as text, so it is invalid unless the type can hold it (mixed content, or whitespace in content that allows only elements).

Support wildcards that allow no namespace. `namespace: []` on `x.any` or `x.anyAttribute`, which was an invalid schema, now allows nothing: an element wildcard never matches, and an attribute wildcard allows no undeclared attribute. `loadXsd` and the CLI write an XSD wildcard with an empty `namespace` list, or attribute wildcards with nothing in common, this way instead of throwing `XeneverUnsupportedError`.
