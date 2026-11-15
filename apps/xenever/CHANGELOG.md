# xenever

## 0.2.0

### Minor Changes

- 887057d: The CLI's check flag is now `--ci`, as in barrelify, load-populate-files and nx-lifecycle, with `--check` kept as an alias. Both, and `--no-ci`/`--no-check`, work as before.

### Patch Changes

- Updated dependencies [7951a62]
- Updated dependencies [76a52d7]
- Updated dependencies [ff005f4]
- Updated dependencies [61f7f7d]
- Updated dependencies [b250760]
- Updated dependencies [d3786ed]
- Updated dependencies [d3462ff]
  - format-file@2.0.0
  - generated-signature@0.3.3
  - parse-cwd@2.1.3
  - populate-files@2.0.0

## 0.1.0

### Minor Changes

- a62dafe: First release. `parse` checks an XML document against a schema built with the `x` builders and returns a value typed by it, and `xenever/xsd` with the `xenever` CLI generates those builders from an XSD.
