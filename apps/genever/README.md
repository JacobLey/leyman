# genever

Generate types from JSON Schema files and OpenAPI documents, with strict schema checks.

genever reads a schema the way a validator does, and writes the narrowest types that still hold every value the schema accepts. What it does is the same in every language it writes:

- **Strict mode.** Schemas that are valid but most likely mistakes (an unknown keyword, `required` naming a property that isn't declared, `nullable` outside OpenAPI 3.0) fail, at the JSON Pointer of the mistake. It can be turned off, and the types then follow what a validator accepts.
- **The same errors.** An invalid or unsupported schema fails with the same kind of error, at the same pointer, whichever implementation reads it.
- **Dialects.** JSON Schema 2020-12, draft-07 and draft-04, and the schemas of OpenAPI 3.0 and 3.1 documents, whose `components.schemas` each become a type.
- **References.** `$ref`s to other files and URLs are loaded (JSON or YAML), with an allowlist of hosts, and `$id`s and `$anchor`s resolve.
- **Kept in sync.** A generated file is written only when it changed, can be signed so hand edits are refused, and can be listed in a manifest with hashes of its inputs, through [populate-files](../populate-files/) and [generated-signature](../../tools/generated-signature/).

## Implementations

| Implementation | Writes | Status |
|----------------|--------|--------|
| [`ts`](./ts/) | TypeScript, the same types Juniper infers | Published to npm as [`genever`](https://www.npmjs.com/package/genever) |
| [`go`](./go/) | Go structs, with the JSON code unions and tuples need | In this repository only |

Each implementation runs the shared [test vectors](./test-vectors/): Juniper's fixtures with sample values every generated type must accept, and the schemas genever rejects, with the pointer of each error. A language's types can be wider than another's where the language can't say more (Go has no union types), but never narrower than what the schema accepts.
