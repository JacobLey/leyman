---
"decant": minor
---

First release: generate TypeScript types from JSON Schema files and OpenAPI 3.0 and 3.1 documents, from the CLI (`decant <input>`) or the API (`decant`, `decantFile`). Supports JSON Schema 2020-12 and draft 7, and OpenAPI 3.0 schemas with `openApi30`. Arrays with `minItems` up to 3 type their required items, e.g. `[T, ...T[]]`. Strict mode, on by default, rejects likely mistakes in the schema, such as unknown keywords and contradictions like `minLength` over `maxLength`. Without it, types follow exactly what a validator accepts. `--ci` checks a generated file is up to date.
