---
"genever": minor
---

Pointers, of errors and of `geneverSource` names, are percent-encoded as URI fragments (RFC 6901 §6), so each is also a `$ref` to the same place: the property `a b` is `#/properties/a%20b`, and `{id}` in a path is `%7Bid%7D`. The `$ref` a YAML recursive alias becomes is encoded the same way, so a key with `#` no longer breaks it.

Of several mistakes, the one reported is now the first in a fixed order, the same in every genever implementation: the members of every object (properties, definitions, paths and the rest) are checked in the UTF-16 code unit order of their keys (RFC 8785 §3.2.3), not the order a JavaScript object keeps them in. Generated types keep the input's order, but when two names collide, the suffix (`Address2`) goes to the later one in that order, and referenced files load in it.

A discriminator `mapping` to a component name with `~` or `%` now resolves.
