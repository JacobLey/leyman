# e2e-eslint-config-schema

Checks that eslint-config's hand-written package.json schema matches what juniper builds.

[`@leyman/eslint-config`](../../leyman/eslint-config) validates `package.json` files with a JSON schema, written out by hand. [`juniper`](../../apps/juniper) is the natural way to build it, but juniper lints with eslint-config, so eslint-config can't depend on it.

This package depends on both, and tests that the schema and its `PackageJson` type are equal to the ones juniper builds and infers. When the test fails, update the hand-written schema (or type) in eslint-config to match.

It is not published, and has no source of its own: only tests.
