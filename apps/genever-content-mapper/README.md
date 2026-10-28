<div style="text-align:center">

# genever-content-mapper
A TypeScript 7.1 content mapper: import an OpenAPI document or JSON Schema file and get genever's types, with no generated file.

</div>

- **No codegen step.** `import type { Paths } from './api.openapi.yaml'` is typed straight from the document, so nothing is generated, committed or checked for drift.
- **The same types as genever.** It runs [genever](../genever/) on the file, with the same strict checks and options, so switching from a generated file changes nothing.
- **Errors where they are.** A strict mode mistake, or an invalid schema, is reported by `tsc` (and editors) at its line and column in the YAML file.
- **Inert.** It reads only the text TypeScript sends it: no other files, no network, no environment variables.

**Requires TypeScript 7.1** (`typescript@7.1.0-beta` or later), whose content mappers are new and may still change before its stable release. Private for now, and not on npm yet.

## Contents
- [Example](#example)
- [Usage](#usage)
- [Options](#options)
- [Errors](#errors)
- [Limitations](#limitations)
- [Security](#security)
- [API](#api)
- [Also See](#also-see)

## Example

Register the mapper for the extensions of your documents, in `tsconfig.json` (beside `compilerOptions`, not inside it):

```json
{
    "compilerOptions": { "strict": true, "module": "nodenext" },
    "contentMappers": [
        {
            "package": "genever-content-mapper",
            "extensions": [".openapi.yaml", ".schema.yaml"]
        }
    ]
}
```

Import the types:

```ts
import type { Paths, Note } from './notes.openapi.yaml';
import type { Schema as User } from './user.schema.yaml';
```

And run `tsc` with `--runExternalCode`, which TypeScript requires before it runs any content mapper:

```sh
tsc --runExternalCode -p .
```

## Usage

The mapper turns each file with one of the registered extensions into genever's types. A document with an `openapi` version is an OpenAPI 3.0 or 3.1 document, with a type per `components.schemas` entry, plus `Paths` and `Operations`. Anything else is a JSON Schema, whose root is the `Schema` type (see the `name` option) and each `$defs` entry a type of its own. See genever's README for how schemas become types.

**Which extensions.** You choose them in `tsconfig.json`. Files are read as YAML 1.2, so a file of JSON works too. A compound extension (`.openapi.yaml`, `.schema.yaml`) keeps unrelated YAML files out. TypeScript refuses to map an extension ending in one it reads itself, such as `.json` or `.openapi.json`, so a JSON document needs a mapped name like `api.openapi.yaml`. Its contents can stay JSON.

**Type-only imports.** The types exist only for the compiler: nothing at runtime can import the document through the mapper. Use `import type`, which every JavaScript build drops.

## Options

Options go in the `contentMappers` entry's `options`, and apply to every mapped file of the project:

```json
{ "package": "genever-content-mapper", "extensions": [".schema.yaml"], "options": { "name": "Root", "strict": false } }
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | `'Schema'` | Name of a JSON Schema's root type. Not used for an OpenAPI document. |
| `strict` | `boolean` | `true` | Fail on likely mistakes, such as unknown keywords. |
| `openApi30` | `boolean` | `false` | Read a JSON Schema as an OpenAPI 3.0 schema, which allows `nullable` and `example`. An OpenAPI document's own version is used instead. |
| `parameterDefaults` | `boolean` | `false` | With an OpenAPI document, also generate `OperationRequest<Id>`, with parameters' defaults filled in. |
| `typedMinItems` | `number` | `3` | Largest `minItems` typed as required items, e.g. `[T, ...T[]]`. `0` turns it off. |

An unknown or invalid option is an error at that option in `tsconfig.json` (`genever1`).

## Errors

A document with an error has no types (its imports fail too), and the error is reported in the document, as `genever` followed by a code:

| Code | Error |
|------|-------|
| `genever100` | Anything unexpected. The message says what. |
| `genever101` | The file isn't YAML, or uses something JSON can't hold (a duplicate key, a tag beyond YAML's core schema). |
| `genever102` | Not a valid schema, e.g. `properties` isn't an object, a `$ref` doesn't resolve, or a value has no JSON equivalent (`.inf`). |
| `genever103` | A [strict mode](../genever/README.md#strict-mode) rule is broken. |
| `genever104` | genever doesn't support the feature, including a `$ref` to another file or a URL (see below). |

The error covers the entry it is about (its key and value), e.g. `minLenght: 1` for an unknown keyword.

## Limitations

- **One file at a time.** TypeScript sends a mapper one file, and never runs it again when another file changes, so a type built from another file would go stale in editors and incremental builds. A `$ref` to another file or a URL is an error (`genever104`): keep each document self-contained, or bundle it first. References within the document (`#/components/schemas/Note`) work as usual.
- **Errors stop type checking.** TypeScript reports a mapper's errors as syntax errors, and doesn't type check a project with syntax errors, so other errors only show up once the document's are fixed.
- **Option errors need a mapped file.** TypeScript only asks the mapper about its options once a mapped file is in the program.
- **No navigation into the document yet.** Go to definition on a type goes nowhere: none of the types map back to the document's text.
- **Tools on the TypeScript 6 API don't run mappers**, such as typescript-eslint. To them, an import of a mapped file is unresolved.

## Security

A content mapper is a program TypeScript runs, in the compiler and in editors, whenever a mapped file is in the program. That's why `tsc` needs `--runExternalCode`, and VS Code workspace trust plus its content mapper permission. Pass `--runExternalCode` only where a mapper is used, rather than in a shared config.

This mapper is inert: it reads only the text TypeScript sends it, and never another file, the network or the environment. A `$ref` to a file or URL is an error rather than a fetch.

## API

The mapper itself needs no code: TypeScript runs the package's `bin.mjs`, named in its `package.json` (`typescript.contentMapper.exec`). These exports are for tools that want the same types or errors without the compiler.

### `mapDocument(text, fileName, options?)`

The types of one document, as the mapper returns them to TypeScript.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `text` | `string` | — | Required. The document's contents, YAML or JSON. |
| `fileName` | `string` | — | Required. Absolute path of the document, which `$id`s resolve against. |
| `options` | `MapperOptions` | `{}` | See [Options](#options). |

**Returns** `MappedDocument`: `{ text, diagnostics }`. `text` is genever's TypeScript source, or `export {};` if the document has errors. Each diagnostic is `{ messageText, start, length, code }`, with `start` and `length` in JavaScript string indices.

### `serve(input, output)`

Run the content mapper protocol (JSON-RPC 2.0 with `Content-Length` framing) over a pair of streams. Returns a promise that resolves once `input` ends.

### `diagnosticCodes`, `diagnosticSource`

The [error codes](#errors) by name (`{ unexpected: 100, syntax: 101, invalidSchema: 102, strictMode: 103, unsupported: 104 }`), and the `genever` prefix TypeScript shows before them.

## Also See

- [genever](../genever/): the same types as a generated file, from the CLI or `geneverFile`, for TypeScript before 7.1, or documents that `$ref` other files.
