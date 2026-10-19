# generated-signature

## 0.1.0

### Minor Changes

- d8aecec: Add the `generated-signature/eslint` entry point, an ESLint plugin with a `valid` rule that reports files edited outside their manual sections. `eslint` is an optional peer dependency, and the main entry point never loads the plugin.
- 5018ce7: New package: sign generated files with a `@generated-signature` token, verify them without running the generator, and keep manual sections that are excluded from the signature and carried over on regeneration.
- d4d116d: Add manifest helpers for generated files that can't carry a token (e.g. JSON): `contentHash`, `verifyManifestEntry`, `parseManifest` and `serializeManifest`.

### Patch Changes

- c6893ec: The `generated-signature/valid` rule's documentation link now points to its page on the docs site.
