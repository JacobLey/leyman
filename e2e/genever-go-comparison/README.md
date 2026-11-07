# e2e-genever-go-comparison

Runs [genever-go](../../apps/genever/go/) and the most used tools for generating Go types from JSON Schema or OpenAPI through the same probes, for the [report on the docs site](https://jacobley.github.io/leyman/packages/genever/go-comparison). The Go counterpart of [`e2e/genever-comparison`](../genever-comparison/), giving its tools the same documents: that package writes them as JSON to its `out/`, and this one reads them by path.

The nightly comparison workflow runs `nx run @leyman/e2e-genever-go-comparison:comparison-report`, which writes `report/genever-go.json`, in the TypeScript report's form. It never gates anything: it isn't part of `verify`, and doesn't run on pull requests or pushes.

Go has no union or literal types, so a probe decodes a JSON value into a tool's type, built with a small harness in a temporary module: a value the schema allows must decode and encode back unchanged (so `null` stays apart from an absent property, and a union keeps its branch), and a value of the wrong shape must fail to decode. Constraints a Go type can't hold, such as `pattern` or `required`, are a validator's job, so no probe checks them: go-jsonschema validates some of them while decoding, and genever-go leaves them to a validator.

Tests only assert genever-go's own results. Another tool's results are what the report shows: one failing a probe, generating source that doesn't build, or crashing, is a result, and doesn't fail anything.

Add a tool in [`tools.go`](./tools.go), and a probe in [`probes.go`](./probes.go). Versions come from `go.mod`, and times are from a shared CI runner, so compare tools within one run, rather than across runs.

It is not published.
