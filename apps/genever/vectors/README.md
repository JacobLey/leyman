# genever-vectors

Schemas and sample values shared by every genever implementation: Juniper fixtures as TypeScript, and as JSON for the Go implementation.

The [TypeScript genever](../) checks that each fixture's generated type is the type Juniper infers, and accepts every sample. The [Go implementation](../go/) can't run Juniper, so it reads the same fixtures as JSON, and checks that every sample decodes into its generated types and encodes back unchanged. Both are held to the same schemas, not to each other.

```ts
import { juniperSchemas, openApiSchemas } from '@leyman/genever-vectors';
```

It is also a Go module, embedding the JSON:

```go
import "github.com/JacobLey/leyman/apps/genever/vectors"

data, err := vectors.Fixtures.ReadFile("out/fixtures/tuple.json")
```

The module is not published, so require it with a `replace` pointing at this directory.

## Format

The `populate-files` target writes `out/fixtures/<name>.json` for each export of [`src/juniper-schemas.ts`](./src/juniper-schemas.ts), committed, and CI fails if one is stale:

```json
{
    "schema": { "type": "array", "prefixItems": [{ "type": "string" }, { "type": "number" }], "items": false },
    "samples": [["", -5.4e-323], ["a", 12]]
}
```

`schema` is the fixture's `toJSON()`, and `samples` are values it accepts, from [juniper-arbitrary](../../juniper-arbitrary/) with a fixed seed, so the files only change when the fixtures (or juniper-arbitrary) do. A fixture that accepts nothing (`never`) has none.

## Development

Run through Nx, like any other project:

```sh
nx run @leyman/genever-vectors:build   # regenerates out/
```
