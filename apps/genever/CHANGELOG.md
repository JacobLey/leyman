# genever

## 0.2.0

### Minor Changes

- 48176cc: Load URLs from only some hosts: `fetch: ['example.com', '*.example.com']` in `geneverFile`, or `--fetch-host` (repeatable) in the CLI. A host matches on any port unless it names one, and `*.example.com` matches its subdomains. Redirects are only followed to allowed hosts.
- 1353b7a: Add `--manifest` (`manifest`): records the output in a populate-files manifest, with hashes of every file and URL read, genever's version and the options. With `--ci`, an output whose entry still matches is up to date without loading anything, so CI no longer fetches remote schemas, or fails when one changes upstream.
- 0e6854a: Add `--signed` (`signed`) to sign the output file with `generated-signature`, so edits to it are detected, and `--force` (`force`) to overwrite an edited or unsigned output file.

### Patch Changes

- Updated dependencies [c6893ec]
- Updated dependencies [d8aecec]
- Updated dependencies [5018ce7]
- Updated dependencies [d4d116d]
- Updated dependencies [50bf351]
- Updated dependencies [10f37ef]
  - generated-signature@0.1.0
  - populate-files@1.1.0

## 0.1.0

### Minor Changes

- c4dc59b: First release: generate TypeScript types from JSON Schema files and OpenAPI 3.0 and 3.1 documents, in JSON or YAML, from the CLI (`genever <input>`) or the API (`genever`, `geneverFile`). References to other files and URLs are loaded into the same output (`--no-fetch` for files only), with `$id` and `$anchor` resolved as JSON Schema 2020-12 specifies. Supports JSON Schema 2020-12, draft 7 and draft-04, and OpenAPI 3.0 schemas with `openApi30`. Arrays with `minItems` up to 3 type their required items, e.g. `[T, ...T[]]`. Strict mode, on by default, rejects likely mistakes in the schema, such as unknown keywords and contradictions like `minLength` over `maxLength`. Without it, types follow exactly what a validator accepts. `--ci` checks a generated file is up to date.
