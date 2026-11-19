---
"xenever": minor
---

Breaking: `loadXsd` and the CLI now give an element whose named complex type has types derived from it in the XSD those types as its `types`. Its value gains `type`, the name of the type it was read as, and its generated type becomes a union over them. Elements whose type nothing derives from keep their shape. To keep the shapes of 0.2.0, pass `unsafeIgnoreDerivedTypes: true` to `loadXsd` or `xeneverFile`, or `--unsafe-ignore-derived-types` to the CLI: elements then get no `types`, and an `xsi:type` may name only the element's own type. Either way, generated files and the loaded schema now give each named complex type its `name` and `namespace`. That changes the TypeScript type of the generated schema consts, not of the values `parse` returns, and lets an `xsi:type` name the element's own type, which 0.2.0 rejected as unsupported.
