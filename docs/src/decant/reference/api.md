---
description: The decant CLI and its flags, the decant() and decantFile() functions, and the errors they throw.
---

# API and CLI

## CLI

```sh
decant <input> [options]
```

| Option | Default | Description |
|--------|---------|-------------|
| `-o`, `--output` | input path with `.ts` | Path of the TypeScript file to write. `.json`, `.yaml` and `.yml` are replaced. |
| `--name` | `Schema` | Name of the root schema's type. Not used for an OpenAPI document. |
| `--strict` | `true` | Fail on likely mistakes. Disable with `--no-strict`. |
| `--typed-min-items` | `3` | Largest `minItems` typed as required items. `0` turns it off. |
| `--open-api-30` | `false` | Read the schema as an OpenAPI 3.0 schema. An OpenAPI document's own version is used instead. |
| `--ci` | `true` in CI | Fail if the output file is not up to date. Implies `--dry-run`. |
| `--dry-run` | `false` | Do not write the output file. |
| `--fetch` | `true` | Load URLs the schema references. `--no-fetch` loads only files. |
| `--cwd` | `.` | Directory relative paths resolve from. |

The path of a written file is logged. Nothing is logged when it was already up to date.

## `decant(schema, options?)`

Generate TypeScript types from a JSON Schema.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `schema` | `unknown` | — | Required. Parsed JSON Schema, or OpenAPI document. |
| `options.name` | `string` | `'Schema'` | Name of the root schema's type. Not used for an OpenAPI document. |
| `options.strict` | `boolean` | `true` | Fail on likely mistakes. See [Strict mode](/decant/guides/strict-mode). |
| `options.baseUri` | `string` | a placeholder | URI the schema was read from, which relative `$id`s and `$ref`s resolve against. |
| `options.typedMinItems` | `number` | `3` | Largest `minItems` typed as required items, e.g. `[T, ...T[]]`. `0` turns it off. The default matches Juniper. |
| `options.openApi30` | `boolean` | `false` | Read the schema as an OpenAPI 3.0 schema, which allows `nullable` and `example`. An OpenAPI document's own version is used instead. |

**Returns** `string` — TypeScript source, not formatted.

**Throws** `DecantError` — see [Errors](#errors).

```ts
import { decant } from 'decant';

decant({ type: 'array', items: { type: 'string' } }, { name: 'Tags' });
// export type Tags = string[];
```

---

## `decantFile(input, options?)`

Read a JSON Schema file, or OpenAPI document, in JSON or YAML, and write its types to a TypeScript file.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `input` | `string` | — | Required. Path to the JSON Schema file, or OpenAPI document. |
| `options.output` | `string` | input path with `.ts` instead of `.json`, `.yaml` or `.yml` | Path of the TypeScript file to write. |
| `options.cwd` | `string \| URL` | `process.cwd()` | Directory relative paths resolve from. |
| `options.check` | `boolean` | `false` | Fail, rather than write, if the output file is not up to date. |
| `options.dryRun` | `boolean` | `false` | Do not write the output file. |
| `options.fetch` | `boolean` | `true` | Load `http:` and `https:` URLs the schema references. Otherwise only files are loaded. |
| `options.name`, `options.strict`, `options.openApi30`, `options.typedMinItems` | | | Same as [`decant`](#decant-schema-options). |

**Returns** `Promise<{ output: string; updated: boolean }>` — absolute path of the output file, and whether its content changed.

**Throws** `DecantError` — see [Errors](#errors). With `check`, also throws if the file is out of date.

---

## YAML

A `.yaml` or `.yml` file is read as YAML 1.2, whether it is the input or a file it references, and so is a URL served with a YAML media type. YAML 1.2 reads `on`, `off`, `yes` and `no` as strings, not booleans.

Anchors and aliases are expanded, and merge keys (`<<: *base`) are merged. An alias inside the schema it names, a recursive schema, becomes a `$ref` to that schema:

```yaml
# node.yaml: `decant node.yaml --name Node` writes `type Node = { children?: Node[] }`
&node
type: object
properties:
  children: { type: array, items: *node }
```

The `$ref` follows the usual rules: one that applies to the same value again, such as `&a { anyOf: [*a, …] }`, breaks [strict mode](/decant/guides/strict-mode). A recursive schema with another `$id` between the alias and its anchor throws a `DecantUnsupportedError`.

Anything else JSON can't hold is an error. Tags beyond YAML's core schema (such as `!!binary`), keys that aren't strings, duplicate keys and more than one document throw the [`yaml`](https://www.npmjs.com/package/yaml) package's `YAMLError`, as invalid JSON throws a `SyntaxError`. `.inf`, `.nan`, and an alias inside a value that isn't a schema (such as a `const`) throw a `DecantInvalidSchemaError`. In a referenced file, any of these is a `DecantLoadError`.

## Errors

Every error extends `DecantError`, with a `pointer` property: the JSON Pointer to the schema or keyword at fault, e.g. `#/properties/a/type`. The pointer is also at the end of the message.

| Error | Thrown when |
|-------|-------------|
| `DecantInvalidSchemaError` | The input is not a valid JSON Schema, e.g. `properties` is not an object, or a `$ref` does not resolve. |
| `DecantStrictModeError` | A [strict mode](/decant/guides/strict-mode) rule is broken. |
| `DecantUnsupportedError` | The schema uses a feature decant can't generate types for. See [Not supported](/decant/reference/types#not-supported). |
| `DecantLoadError` | A file or URL the schema references could not be loaded. Its `cause` is the underlying error, such as the file system's or the parser's, if there was one. |
