# e2e-genever-comparison

Runs [`genever`](../../apps/genever) and the top tools for generating TypeScript types from JSON Schema or OpenAPI through the same probes, for the report on the docs site.

A nightly workflow runs `nx run @leyman/e2e-genever-comparison:comparison-report`, which writes `report/genever.json`. It never gates anything: it isn't part of `verify`, and doesn't run on pull requests or pushes.

Tests only assert genever's own results. Another tool's results are what the report shows: one failing a probe, or crashing, is a result, and doesn't fail anything.

Add a tool in [`src/tools.ts`](./src/tools.ts), and a probe in [`src/probes.ts`](./src/probes.ts).

Versions come from the lockfile. The benchmark only times tools that generate source: one that infers in the type system does its work while type-checking, and type-check cost isn't compared. Times are from a shared CI runner, so compare tools within one run, rather than across runs.

What the report doesn't cover is written by hand: the "Compared to" lists in [genever's README](../../apps/genever/README.md#compared-to-alternatives) and [docs overview](../../docs/src/packages/genever/index.md) name the versions they were inspected at. Re-check them now and then, and bump the versions.

It is not published.
