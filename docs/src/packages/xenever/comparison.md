---
description: xenever, @abapify/ts-xsd, xml-xsd-engine and fast-xml-parser run through the same XML schemas and documents every night
---

# Comparison

Every night, a [workflow](https://github.com/JacobLey/leyman/blob/main/.github/workflows/comparison-report.yml) runs xenever and three other XML tools through the same schemas and documents, and this page shows the latest report:

- [@abapify/ts-xsd](https://www.npmjs.com/package/@abapify/ts-xsd) and [xml-xsd-engine](https://www.npmjs.com/package/xml-xsd-engine), the other TypeScript packages that read an XSD and generate types. ts-xsd's value comes from its `parseXml` and its type from its interface codegen. xml-xsd-engine validates with its `validate`, converts with its own `xmlToJson` (with the options that match the types its codegen prints) and types the value with its TypeScript codegen.
- [fast-xml-parser](https://www.npmjs.com/package/fast-xml-parser), the most used XML parser. It reads no schema, so its options and types for each schema are [written by hand](https://github.com/JacobLey/leyman/blob/main/e2e/xenever-comparison/src/hand-written.ts), and its validator only checks that a document is well-formed.

Each [scenario](https://github.com/JacobLey/leyman/blob/main/e2e/xenever-comparison/src/scenarios.ts) is a schema, a few documents, and probes. A probe checks that a document is accepted or rejected, that its parsed value has a property, that an error gives the right line, or that the tool's type accepts the parsed value and rejects a changed copy of it, checked with the TypeScript compiler. Values are looked up by local name anywhere in the result, since every tool shapes them differently. Only xenever's results are tested; the rest are what each tool did in this run, at the version shown.

The scenarios include XSD features xenever doesn't support yet (`xsi:type`, substitution groups and identity constraints), so the report shows where it falls short too.

To run the comparison yourself, from a checkout of the repository:

```sh
nx run @leyman/e2e-xenever-comparison:comparison-report
```

It writes `e2e/xenever-comparison/report/xenever.json`. The documents are built the same way every run, so only the times change. The nightly times are from a shared CI runner, so compare tools within one run rather than across runs. The comparison can't run in the browser, since it needs the TypeScript compiler, esbuild and the file system.

<XeneverComparison />
