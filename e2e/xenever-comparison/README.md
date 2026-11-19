# e2e-xenever-comparison

Runs [`xenever`](../../apps/xenever) and the tools it is compared to through the same XML schemas and documents, for the report on the docs site.

The tools are `@abapify/ts-xsd` and `xml-xsd-engine`, the two other TypeScript packages that read an XSD and generate types, and `fast-xml-parser`, the most used XML parser, which reads no schema, so its options and types for each scenario are written by hand in [`src/hand-written.ts`](./src/hand-written.ts).

Each scenario in [`src/scenarios.ts`](./src/scenarios.ts) is a schema, some documents, and probes: a document is accepted or rejected, its parsed value has some property (looked up by local name, since every tool shapes values its own way), an error gives a line, or the tool's type accepts or rejects the parsed value, checked with the TypeScript compiler. A probe only records what the tool did in the run. Scenarios marked `xsdOnly` are about reading an XSD, so `fast-xml-parser` has nothing to run there.

The report also bundles what each tool needs at runtime to parse a document (with esbuild, minified, Node.js built-ins left as imports and listed), and times each tool parsing a purchase order of 1,000 items, built the same way every run (`purchaseOrder` in the scenarios). The schema is loaded once, before timing.

A nightly workflow runs `nx run @leyman/e2e-xenever-comparison:comparison-report`, which writes `report/xenever.json`. It never gates anything: it isn't part of `verify`, and doesn't run on pull requests or pushes. Times are from a shared CI runner, so compare tools within one run, rather than across runs.

Tests only assert xenever's own results: it passes every probe. Another tool's results are what the report shows: one failing a probe, or crashing, is a result, and doesn't fail anything.

Add a tool in [`src/tools.ts`](./src/tools.ts), and a scenario in [`src/scenarios.ts`](./src/scenarios.ts) (with a hand-written setup for `fast-xml-parser` unless it is `xsdOnly`).

It is not published.
