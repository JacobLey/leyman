# genever-go

## 0.2.1

- Requires populate-files/go v0.2.0. GenerateFile never cleans, so its new UnsafeCleanUnlisted option changes nothing here.
- GenerateFile gives each URL 30 seconds to load, its redirects and body included, and then fails with ErrLoad, instead of waiting forever on a server that never answers.
- A definition with only `$id` and `$ref` that the schema itself declares is a type like any other, and its `$ref` is checked, so one to a document that isn't loaded fails with ErrUnsupported instead of being dropped. Only the aliases GenerateFile adds itself, when a file's `$id` isn't the URL it was loaded from, are still seen through. So a referenced file that only holds a `$ref` is a type named after it, and two such definitions referring to each other are a strict mode error, like any other `$ref` back to the same value.
- An integer `const` or `enum` value too large for an int64, such as `1e20`, is that value, not `Never`. Every float64 that large is an integer.
- `FileOptions.Client` may follow redirects: GenerateFile fetches through a copy of it that doesn't, so a redirect to a host `FetchHosts` doesn't allow fails with ErrLoad instead of being followed. The caller's client is left as it was.
- An `enum` of only numbers, such as `[2, 3]`, is a `float64` type with a constant per value, as an enum of only strings is a `string` type, instead of a union of one variant. One of `true` and `false` is a `bool` type.

## 0.2.0

- Pointers, of errors and of `GenerateSource` names, are percent-encoded as URI fragments (RFC 6901 §6), so each is also a `$ref` to the same place: the property `a b` is `#/properties/a%20b`. The `$ref` a YAML recursive alias becomes is encoded the same way, so a key with `#` no longer breaks it.
- Of several mistakes, the one reported is the first in a fixed order, the same as the TypeScript genever's: the members of every object (properties, definitions, paths and the rest) are checked in the UTF-16 code unit order of their keys (RFC 8785 §3.2.3), not the order they are written in. Generated code keeps the input's order, but when two names collide, the suffix (`Address2`) goes to the later one in that order, and referenced files load in it.
- A value a YAML merge key merges but the map's own key replaces is no longer read, so it can't fail.
- A discriminator `mapping` to a component name with `~` or `%` resolves.

## 0.1.0

- First release: Go types from JSON Schema files and OpenAPI documents, held to the same test vectors as the TypeScript genever, and a `genever` command that writes them through populate-files.
