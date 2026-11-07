# genever-test-vectors

Schemas and sample values shared by every genever implementation: Juniper fixtures and schemas genever rejects, as TypeScript, and as JSON for the Go implementation.

The [TypeScript genever](../ts/) checks that each fixture's generated type is the type Juniper infers, and accepts every sample. The [Go implementation](../go/) can't run Juniper, so it reads the same fixtures as JSON, and checks that every sample decodes into its generated types and encodes back unchanged. Both are held to the same schemas, not to each other. Both also reject the same error cases with the same kind of error, at the same JSON Pointer.

```ts
import { invalidSchemas, juniperSchemas, openApiSchemas, strictSchemas, unsupportedSchemas } from '@leyman/genever-test-vectors';
```

Implementations in other languages read the JSON files under [`out/`](./out/) by path, from the working copy, so the published Go module needs no module of vectors.

## Format

The `populate-files` target writes `out/fixtures/<name>.json` for each export of [`src/juniper-schemas.ts`](./src/juniper-schemas.ts), committed, and CI fails if one is stale:

```json
{
    "schema": { "type": "array", "prefixItems": [{ "type": "string" }, { "type": "number" }], "items": false },
    "samples": [["", -5.4e-323], ["a", 12]]
}
```

`schema` is the fixture's `toJSON()`, and `samples` are values it accepts, from [juniper-arbitrary](../../juniper-arbitrary/) with a fixed seed, so the files only change when the fixtures (or juniper-arbitrary) do. A fixture that accepts nothing (`never`) has none.

It writes `out/openapi/<version>.json` for OpenAPI 3.0.3 and 3.1.0: a `document` with the fixtures of [`src/openapi-schemas.ts`](./src/openapi-schemas.ts) as its `components.schemas`, and `samples` of each component, by name.

It also writes `out/errors.json` from [`src/error-schemas.ts`](./src/error-schemas.ts): each kind of error (`invalid`, `strict` or `unsupported`) maps a case's name to the schema, any options, and the pointer to the fault:

```json
{
    "invalid": {
        "type is unknown": { "schema": { "type": "date" }, "pointer": "#/type" }
    },
    "strict": {
        "unknown keyword": { "schema": { "type": "string", "foo": 1 }, "pointer": "#/foo" }
    },
    "unsupported": {
        "$dynamicRef": { "options": { "strict": false }, "schema": { "$dynamicRef": "#node" }, "pointer": "#/$dynamicRef" }
    }
}
```

`options` takes `openApi30` and `strict`, as genever's options do. Each `strict` case is accepted with strict mode off.

## Development

Run through Nx, like any other project:

```sh
nx run @leyman/genever-test-vectors:build   # regenerates out/
```
