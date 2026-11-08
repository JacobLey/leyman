# generated-signature

## 0.3.1

### Patch Changes

- 3b36dd0: The package's repository directory is now `tools/generated-signature/ts`, beside the Go implementation and the shared test vectors.

## 0.3.0

### Minor Changes

- ee0b74b: Update dependencies: @tanstack/react-query@5.105.0, eslint@10.14.0, globals@17.13.0, @typescript-eslint/eslint-plugin@8.72.1, @typescript-eslint/parser@8.72.1, @typescript-eslint/utils@8.72.1, eslint-plugin-regexp@3.3.2.

## 0.2.0

### Minor Changes

- 8461cca: Supports Node.js 22.13 and later: `engines.node` is now `>=22.13.0`, down from `>=24`, the oldest version ESLint supports: juniper and generated-signature have it as an optional peer dependency, for their ESLint rules, and juniper-arbitrary and juniper-validator follow juniper.

## 0.1.3

### Patch Changes

- 7e4c3b2: `homepage` points at the package's docs site page, which the README links too.
- 1e84296: List the comment syntax of each file type, the ESLint peer range and rule configuration, and the `verifyManifestEntry` content type in the README.

## 0.1.2

### Patch Changes

- ea484ef: The ESLint rule's documentation link points at the docs site's new address, under `/packages/`. The old address redirects there.

## 0.1.1

### Patch Changes

- 16c11b8: `sign()` inserts the signature line after Markdown front matter (a leading `---` block, in files with `<!-- -->` comments), instead of above it, which stopped the front matter being read.

## 0.1.0

### Minor Changes

- d8aecec: Add the `generated-signature/eslint` entry point, an ESLint plugin with a `valid` rule that reports files edited outside their manual sections. `eslint` is an optional peer dependency, and the main entry point never loads the plugin.
- 5018ce7: New package: sign generated files with a `@generated-signature` token, verify them without running the generator, and keep manual sections that are excluded from the signature and carried over on regeneration.
- d4d116d: Add manifest helpers for generated files that can't carry a token (e.g. JSON): `contentHash`, `verifyManifestEntry`, `parseManifest` and `serializeManifest`.

### Patch Changes

- c6893ec: The `generated-signature/valid` rule's documentation link now points to its page on the docs site.
