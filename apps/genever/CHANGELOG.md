# genever

## 0.6.0

### Minor Changes

- b9a82da: Require Node.js 24.22.1 or later. genever fetches remote schemas, and earlier Node.js releases have security flaws in `fetch`.

### Patch Changes

- 3857f4e: An empty `manifest` option is a path like any other, rather than meaning no manifest. Leave it out (or pass `null`, in populate-files) for none.
- Updated dependencies [3857f4e]
- Updated dependencies [2612c29]
  - populate-files@1.1.3
  - haywire@2.0.3

## 0.5.0

### Minor Changes

- cc276b8: `GeneverLoadError` has a `referencedFrom`: the URI of the file or URL with the `$ref` that needed it, which its `pointer` is in. A failure to load something another loaded file references now names that file in its message.

### Patch Changes

- 226d20d: Load the files and URLs referenced by the schemas of an OpenAPI document's operations (parameters, request bodies, responses and headers, in `paths` or `components`), not only by its component schemas. Their `$id`s and `$anchor`s are found too.
- 5ddca83: Resolve relative references in a loaded URL against the URL it redirected to, as RFC 3986 does, rather than the URL that was referenced.

## 0.4.1

### Patch Changes

- 40ad200: Name a schema called `Exclude` `Exclude2`, as is done for `Record`, so it doesn't shadow the global type the OpenAPI operation helpers use. The generated file failed to compile with "Type 'Exclude' is not generic".
- Updated dependencies [c610446]
- Updated dependencies [ba43b54]
- Updated dependencies [16c11b8]
- Updated dependencies [bec61e6]
- Updated dependencies [957ab53]
- Updated dependencies [107dea6]
- Updated dependencies [995c22e]
- Updated dependencies [4cbf98a]
- Updated dependencies [975c05d]
  - entry-script@4.1.1
  - format-file@1.0.3
  - generated-signature@0.1.1
  - haywire@2.0.2
  - haywire-launcher@1.1.0
  - populate-files@1.1.2

## 0.4.0

### Minor Changes

- 9e9a851: A document with operations also gets `OperationInput<Id>` and `OperationResult<Id>`, keyed by `operationId`: what a call to the operation sends (parameters by location, and the JSON body, each only if it has them), and every response it documents as `{ status, body }`, so checking `status` narrows `body`.
- 9ee49db: `--parameter-defaults` (`parameterDefaults: true`) also writes `OperationRequest<Id>`, a server handler's view of an operation: as `OperationInput`, but a parameter whose schema has a `default` is required, as a validator that fills in defaults always sets it.

## 0.3.0

### Minor Changes

- ff23724: Strict mode checks `discriminator`: its property must be required, by the schema or by every `oneOf`/`anyOf` branch, and every `mapping` target must exist.
- 90da64c: `discriminator` is accepted in plain JSON Schema too (Juniper emits it for discriminated unions), and `type: "object"` next to a `oneOf` of objects no longer adds a redundant `Record<string, unknown> &` to the type.
- fae82b7: An OpenAPI document with `paths` also generates `Paths` (by path, then method) and `Operations` (by `operationId`) types, in the shape openapi-typescript generates: each operation's `parameters` by location, `requestBody`, and `responses` by status code with `headers` and `content` by media type. `$ref`s to parameters, request bodies, responses, headers and path items are followed.

### Patch Changes

- Updated dependencies [5ab7f8a]
- Updated dependencies [b40f828]
- Updated dependencies [73bfe20]
  - haywire-launcher@1.0.3
  - haywire@2.0.1
  - populate-files@1.1.1

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
