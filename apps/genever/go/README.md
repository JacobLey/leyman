# genever-go

Generate Go types from JSON Schema files, with strict schema checks: the Go parallel of [genever](../ts/).

- **Same schemas, same checks**: a port of genever's converter, held to the [shared vectors](../test-vectors/), so both accept the same schemas and reject the same mistakes, at the same JSON Pointers.
- **Types that hold every valid value**: unions, tuples, `null` and absent properties each get a Go type that tells them apart, with the `MarshalJSON`/`UnmarshalJSON` they need written into the file.
- **No runtime dependency**: the few helpers the types use (`Optional`, `Null`, `Never`) are written into the generated file.
- **Loads what schemas reference**: files and URLs (with a host allowlist), JSON or YAML, OpenAPI 3.0 and 3.1 documents, and the files of path items, parameters and responses an OpenAPI document refers to.
- **Kept in sync**: writes through the [Go populate-files](../../populate-files/go/), optionally signed and listed in a manifest, compatible with the TypeScript tools.

## Contents

- [Install](#install)
- [Command line](#command-line)
- [API](#api)
- [Types](#types)
  - [Operations](#operations)
- [Compared to genever](#compared-to-genever)
- [Development](#development)

## Install

It needs Go 1.26 or later; the code it generates builds with Go 1.24 or later. As a tool of your module, at a version recorded in its `go.mod`:

```sh
go get -tool github.com/JacobLey/leyman/apps/genever/go/cmd/genever@latest
go tool genever api/openapi.yaml --package api --signed
```

`go install …@latest` doesn't work, since this module's `go.mod` points its workspace dependencies at their copies in this repository. As a library:

```sh
go get github.com/JacobLey/leyman/apps/genever/go@latest
```

Versions are listed in the [changelog](./CHANGELOG.md).

## Command line

```sh
//go:generate go tool genever openapi.yaml --package api --signed
```

Writes `openapi.go` beside the input, and prints its path when it changed. Flags may come before or after the input:

| Flag             | Default                | Description                                                                                                                                 |
| ---------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `-o`, `--output` | input path, with `.go` | Path of the Go file to write                                                                                                                |
| `--name`         | `Schema`               | Name of the root schema type. Not used for an OpenAPI document                                                                              |
| `--package`      | `schema`               | Package of the Go file                                                                                                                      |
| `--no-strict`    |                        | Accept likely mistakes in the schema, such as unknown keywords                                                                              |
| `--open-api-30`  |                        | Read the schema as an OpenAPI 3.0 schema. An OpenAPI document's own version is used instead                                                 |
| `--no-fetch`     |                        | Load only files the schema references, not URLs                                                                                             |
| `--fetch-host`   | every host             | Load only URLs of this host, e.g. `example.com`, `localhost:8080` or `*.example.com`. Repeat for more                                       |
| `--ci`           | in CI                  | Fail if the output is not up to date, without writing                                                                                       |
| `--dry-run`      |                        | Do not write the output                                                                                                                     |
| `--signed`       |                        | Sign the output, and refuse to overwrite it if it was edited or is not signed                                                               |
| `--force`        |                        | With `--signed`, overwrite the output even if it was edited                                                                                 |
| `--manifest`     |                        | Record the output, and hashes of its inputs, in this manifest. With `--ci`, an output still matching it is up to date without fetching URLs |
| `--cwd`          | `.`                    | Directory the paths are relative to                                                                                                         |

It exits with 1 on any error, printed to stderr.

## API

```go
import genever "github.com/JacobLey/leyman/apps/genever/go"

source, err := genever.Generate(schema, genever.Options{
    Name: "Pet", Package: "api", BaseURI: "", OpenAPI30: false, NoStrict: false,
})
```

`Generate(schema, options)` converts one JSON document, and loads nothing. `GenerateFile(ctx, input, options)` is the command line as a function: it reads a file, loads what it references, and writes the output, returning its path and whether it changed.

Errors match with `errors.Is`: `ErrInvalidSchema`, `ErrStrictMode`, `ErrUnsupported`, `ErrLoad` and `ErrSyntax`, each an `*Error` with the JSON Pointer of the problem. `GenerateFile` also fails with [populate-files'](../../populate-files/go/) `ErrCheck` and `ErrOwnership`.

## Types

The root schema is a type named `--name`, and each definition in its `$defs` (or draft 7 `definitions`), or an OpenAPI document's `components.schemas`, is a type named after its key. An OpenAPI document's operations have [types of their own](#operations).

| Schema                                                         | Go                                                                                                                                  |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `string`, `boolean`, `integer`, `number`                       | `string`, `bool`, `int64`, `float64`                                                                                                |
| `null`                                                         | `Null`                                                                                                                              |
| string `enum` or `const`                                       | a string type, with a constant per value                                                                                            |
| object with `properties`                                       | a struct; a required property is a field, an optional one a pointer, or `Optional[T]` where a pointer can't tell absent from `null` |
| other properties (`additionalProperties`, `patternProperties`) | an `AdditionalProperties` map on the struct                                                                                         |
| array                                                          | a slice; a tuple (`prefixItems`) is a struct written as a JSON array                                                                |
| `oneOf`/`anyOf`, or several `type`s                            | a struct holding one of its variants                                                                                                |
| `true`, `{}`                                                   | `json.RawMessage`                                                                                                                   |
| `false`                                                        | `Never`                                                                                                                             |
| a type that holds itself by value                              | a pointer, so the type is finite                                                                                                    |

### Operations

Each operation of an OpenAPI document with an `operationId` has two kinds of types, named after it:

| Type                                                                        | Holds                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<Id>Input`, e.g. `GetUserInput`                                            | What a call sends: `Body`, its `application/json` request body, and `Path`, `Query`, `Header` and `Cookie`, each a struct of its parameters. A field is left out when the operation has none of it, and is a pointer when it's optional |
| `<Id>Response<Status>`, e.g. `GetUserResponse200`, `GetUserResponseDefault` | The `application/json` body of each response that has one                                                                                                                                                                               |

They are the TypeScript genever's `OperationInput` and `OperationResult`, as Go can't key a type by an `operationId`. A path item's parameters apply to each of its operations, and an operation's own parameter replaces one of the same name and location. Operations without an `operationId`, other media types and response headers have no types, but their schemas are checked like any other.

The types only decide which Go value holds a JSON value. They don't validate: check values against the schema with a validator.

## Compared to genever

Go can't express every type TypeScript can, so some types are wider:

- A `pattern`, or a template of strings, is a `string`. Patterns are still checked for strict mode, by a lenient parser, as Go's regexp doesn't read ECMAScript's lookarounds and backreferences.
- An enum's constants don't restrict its type.
- `encoding/json` matches keys case-insensitively, so `{"A": 1}` fills the field for `"a"`.
- An OpenAPI document has no `Paths` or `Operations` types, only each operation's input and response bodies (see [Operations](#operations)), and genever's TypeScript-only options (`--parameter-defaults`, `--typed-min-items`) don't apply.
- Manifests record the generator as `genever-go`, so the Go and TypeScript genever never take each other's output as up to date. They are written unformatted.

## Development

Run through Nx, like any other project:

```sh
nx run @leyman/genever-go:verify
```

It has no `package.json`. generated-signature and populate-files are Go dependencies: `go.mod` requires their modules, with `replace` directives pointing at the workspace copies, and Nx (through the gonx plugin) infers the dependencies from the imports. The tests read the [vectors](../test-vectors/) by path, an implicit dependency in `project.json`, so `go test ./...` also works directly.
