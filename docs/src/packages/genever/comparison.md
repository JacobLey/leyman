---
description: genever and the top tools for generating TypeScript types from JSON Schema and OpenAPI, run through the same probes every night
---

# Comparison

Every night, a [workflow](https://github.com/JacobLey/leyman/blob/main/.github/workflows/comparison-report.yml) runs genever and the top tools for generating TypeScript types through the same checks, and this page shows the latest report.

Each tool gets [the same documents](https://github.com/JacobLey/leyman/blob/main/e2e/genever-comparison/src/documents.ts), and [each probe](https://github.com/JacobLey/leyman/blob/main/e2e/genever-comparison/src/probes.ts) checks its type accepts a valid value, rejects an invalid one, or reads a value as the right type, so `any` doesn't pass. Hover over a cell to see which probes it failed. Only genever's results are tested: the rest are what each tool did in this run, at the version shown.

Only tools that write source are timed. One that infers in the type system does its work while type-checking, which isn't compared, and json-schema-to-zod doesn't follow `$ref`s, so it would look fast by skipping the work. Times are from a shared CI runner, so compare tools within one run, rather than across runs.

<GeneverComparison />
