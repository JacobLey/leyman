---
description: genever-go and the most used tools for generating Go types from JSON Schema and OpenAPI, run through the same probes every night
---

# Go comparison

Every night, the same [workflow](https://github.com/JacobLey/leyman/blob/main/.github/workflows/comparison-report.yml) as the [TypeScript comparison](/packages/genever/comparison) runs [genever-go](/packages/genever/guides/go) and the most used tools for generating Go types through the same checks, and this page shows the latest report.

Each tool gets [the same documents](https://github.com/JacobLey/leyman/blob/main/e2e/genever-comparison/src/documents.ts) as in the TypeScript comparison. Go has no union or literal types, so [each probe](https://github.com/JacobLey/leyman/blob/main/e2e/genever-go-comparison/probes.go) decodes a JSON value into the tool's type: a value the schema allows must decode and encode back unchanged, so `null` stays apart from an absent property and a union keeps its branch, and a value of the wrong shape must fail to decode. Constraints a Go type can't hold, such as `pattern` or `required`, are a validator's job, so no probe checks them. Hover over a cell to see which probes it failed. Only genever-go's results are tested: the rest are what each tool did in this run, at the version shown.

The OpenAPI probes decode the document's request body, its `Note` schema. Times are from a shared CI runner, so compare tools within one run, rather than across runs.

<GeneverComparison report="genever-go" />
