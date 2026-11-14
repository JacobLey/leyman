# genever-go

## 0.2.0

- Pointers, of errors and of `GenerateSource` names, are percent-encoded as URI fragments (RFC 6901 §6), so each is also a `$ref` to the same place: the property `a b` is `#/properties/a%20b`. The `$ref` a YAML recursive alias becomes is encoded the same way, so a key with `#` no longer breaks it.
- Of several mistakes, the one reported is the first in a fixed order, the same as the TypeScript genever's: the members of every object (properties, definitions, paths and the rest) are checked in the UTF-16 code unit order of their keys (RFC 8785 §3.2.3), not the order they are written in. Generated code keeps the input's order, but when two names collide, the suffix (`Address2`) goes to the later one in that order, and referenced files load in it.
- A value a YAML merge key merges but the map's own key replaces is no longer read, so it can't fail.
- A discriminator `mapping` to a component name with `~` or `%` resolves.

## 0.1.0

- First release: Go types from JSON Schema files and OpenAPI documents, held to the same test vectors as the TypeScript genever, and a `genever` command that writes them through populate-files.
