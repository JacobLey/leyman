---
description: genever-go generates Go types from the same JSON Schema files and OpenAPI documents, with the same strict checks, held to the same test vectors.
---

# Go

genever-go is genever for Go: it reads the same JSON Schema files and OpenAPI documents, accepts and rejects the same schemas (at the same JSON Pointers), and writes Go types instead of TypeScript ones. Both are held to the same [test vectors](https://github.com/JacobLey/leyman/tree/main/apps/genever/test-vectors), not to each other. Go users don't need Node.

## Install

It needs Go 1.24 or later, as does the code it writes. Add it as a tool of your module, so its version is pinned in `go.mod`:

```sh
go get -tool github.com/JacobLey/leyman/apps/genever/go/cmd/genever@latest
```

Then generate from a `go:generate` line:

```go
//go:generate go tool genever openapi.yaml --package api --signed
package api
```

`go install …@latest` doesn't work: the module's `go.mod` points its dependencies at their copies in genever's repository, which `go install` refuses and `go get -tool` ignores.

The command takes genever's flags, apart from the TypeScript-only `--typed-min-items`, plus `--package` for the Go package. As a library:

```go
import genever "github.com/JacobLey/leyman/apps/genever/go"

source, err := genever.Generate(schema, genever.Options{Name: "Pet", Package: "api"})
```

`GenerateSource` also returns where each type's and field's name is, with the JSON Pointer it is generated from, as `geneverSource` does.

## Types

Every type holds every value the schema accepts, and can tell apart the values the schema tells apart: an absent property from `null`, one branch of a union from another. The `MarshalJSON` and `UnmarshalJSON` methods that takes are written into the generated file, with the few helper types it uses (`Optional`, `Null`, `Never`), so it has no runtime dependency.

| Schema                                      | Go                                                                                                          |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `string`, `boolean`, `integer`, `number`    | `string`, `bool`, `int64`, `float64`                                                                        |
| string `enum` or `const`                    | a string type, with a constant per value                                                                    |
| object with `properties`                    | a struct; an optional property is a pointer, or `Optional[T]` where a pointer can't tell absent from `null` |
| `additionalProperties`, `patternProperties` | an `AdditionalProperties` map on the struct                                                                 |
| array, tuple (`prefixItems`)                | a slice; a struct written as a JSON array                                                                   |
| `oneOf`/`anyOf`, several `type`s            | a struct holding one of its variants                                                                        |
| `true`, `false`                             | `json.RawMessage`, `Never`                                                                                  |

Each operation gets `<Id>Input`, what a call sends (its JSON body, `<Id>Body`, and its path, query, header and cookie parameters), and `<Id>Response<Status>`, each JSON response body. With `--parameter-defaults`, it also gets `<Id>Request`, what a handler gets once a validator filled in defaults. An operation without an `operationId` is named after its method and path: `post /users/{id}` is `PostUsersIdInput`.

Decoding fails only when a value's shape doesn't fit, such as the wrong JSON kind or no branch of a union. Like genever, it doesn't validate: `pattern`, bounds and lengths are a validator's job.

## Compared to genever

Go can't say everything TypeScript can, so some types are wider: a `pattern` is a `string`, an enum's constants don't restrict its type, and `encoding/json` matches keys case-insensitively. The full list is in the [README](https://github.com/JacobLey/leyman/tree/main/apps/genever/go#compared-to-genever).

Its output is kept in sync the same way, through the Go implementations of [populate-files](/packages/populate-files/guides/go) and [generated-signature](/packages/generated-signature/guides/go). Manifests record it as `genever-go`, so the two genevers never take each other's output as up to date.

How it compares with go-jsonschema and oapi-codegen, run every night, is on the [Go comparison](/packages/genever/go-comparison) page.

Versions are in its [changelog](https://github.com/JacobLey/leyman/blob/main/apps/genever/go/CHANGELOG.md).
