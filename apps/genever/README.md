# genever

Generate types from JSON Schema files and OpenAPI documents, with strict schema checks.

genever reads a schema the way a validator does, and writes the narrowest types that still hold every value the schema accepts. Each implementation behaves the same way, whatever language it writes:

- Strict mode fails on schemas that are valid but most likely mistakes (an unknown keyword, `required` naming a property that isn't declared, `nullable` outside OpenAPI 3.0), at the JSON Pointer of the mistake. It can be turned off, and the types then follow what a validator accepts.
- An invalid or unsupported schema fails with the same kind of error, at the same pointer, whichever implementation reads it.
- It reads JSON Schema 2020-12, draft-07 and draft-04, and the schemas of OpenAPI 3.0 and 3.1 documents, where each entry of `components.schemas` becomes a type.
- `$ref`s to other files and URLs are loaded (JSON or YAML), optionally only from an allowlist of hosts, and `$id`s and `$anchor`s resolve.
- A generated file is written only when it changed. Through [populate-files](../populate-files/) and [generated-signature](../../tools/generated-signature/), it can also be signed so hand edits are refused, and listed in a manifest with hashes of its inputs.

## Implementations

| Implementation | Writes | Status |
|----------------|--------|--------|
| [`ts`](./ts/) | TypeScript, the same types Juniper infers | Published to npm as [`genever`](https://www.npmjs.com/package/genever) |
| [`go`](./go/) | Go structs, with the JSON code unions and tuples need | Released as the Go module `github.com/JacobLey/leyman/apps/genever/go` |

Each implementation runs the shared [test vectors](./test-vectors/): Juniper's fixtures with sample values every generated type must accept, and the schemas genever rejects, with the pointer of each error. A language's types can be wider than another's where the language can't say more (Go has no union types), but they still hold every value the schema accepts.
