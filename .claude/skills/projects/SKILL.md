---
name: projects
description: Understanding the various projects/packages available
---

# Projects

A project is any directory with a `project.json`. Every project has a README.md. Almost all are TypeScript packages with a `package.json`. A `go.mod` makes a Go project (see [create-package](../create-package/SKILL.md#go-projects)): [`go-impl`](../../../tools/constant-consistent-hash/go-impl/) is only Go, and [`test-vectors`](../../../tools/constant-consistent-hash/test-vectors/) is both an npm package and a Go module.

- `tools/`: libraries consumed via `import`.
- `apps/`: CLIs, Nx plugins, and larger packages that are used other than by plain `import`.
- `leyman/`: private, repo-internal packages that are never published.
- `docs/`: the documentation site (private, never published). See its [README](../../../docs/README.md).
- `e2e/`: private, test-only packages that check several packages together, in ways no single package can (e.g. because depending on each other would be circular). See [create-package](../create-package/SKILL.md#e2e-packages).

## Packages

**When you add or remove a package, update the table in this file.** Add the new row in alphabetical order within the correct section (Apps, Tools, Leyman, or E2E). The description should match the one-line subtitle in the package's README.md.

**When you remove a published package, add it to the top of [`DEPRECATED_PACKAGES.md`](../../../DEPRECATED_PACKAGES.md)**, linking its source at the last commit before the removal.

See each package's README.md for full usage documentation.

### Apps

| Package | Description |
|---------|-------------|
| [`barrelify`](../../../apps/barrelify/) | Auto-generate TypeScript barrel (`index.ts`) files |
| [`genever`](../../../apps/genever/) | Generate TypeScript types from JSON Schema files and OpenAPI documents, with strict schema checks and the same types Juniper infers |
| [`juniper`](../../../apps/juniper/) | JSON Schema builder with static TypeScript inference |
| [`juniper-validator`](../../../apps/juniper-validator/) | StandardSchema-compliant validator wrapping Juniper schemas |
| [`nx-lifecycle`](../../../apps/nx-lifecycle/) | Nx plugin for managing ordered task dependency lifecycles |
| [`populate-files`](../../../apps/populate-files/populate-files/) | Write dynamic content to static files with CI sync checking |
| [`load-populate-files`](../../../apps/populate-files/load-populate-files/) | Load a config file and run `populate-files` from CLI |

### Tools

| Package | Description |
|---------|-------------|
| [`common-proxy`](../../../tools/common-proxy/) | Synchronously expose ESM-backed functions from CommonJS |
| [`constant-consistent-hash`](../../../tools/constant-consistent-hash/constant-consistent-hash/) | Stateless consistent hashing in constant time, with minimal key movement |
| [`constant-consistent-hash-go`](../../../tools/constant-consistent-hash/go-impl/) | Go implementation of constant-consistent-hash, tested against the shared test vectors (private, Go) |
| [`constant-consistent-hash-test-vectors`](../../../tools/constant-consistent-hash/test-vectors/) | Test vectors shared by every constant-consistent-hash implementation (private) |
| [`default-import`](../../../tools/default-import/) | Correctly extract default exports from CJS modules in ESM |
| [`entry-script`](../../../tools/entry-script/) | Safe CLI entry point pattern — runs only as the Node entrypoint |
| [`enum-to-array`](../../../tools/enum-to-array/) | Convert TypeScript enums to typed arrays of keys/values |
| [`find-import`](../../../tools/find-import/) | Find and load the first matching JS/JSON file in parent directories |
| [`format-file`](../../../tools/format-file/) | Format file content via Biome or Prettier |
| [`generated-signature`](../../../tools/generated-signature/generated-signature/) | Sign generated files so hand edits are detected, while keeping manual sections editable |
| [`haywire`](../../../tools/haywire/) | Type-safe dependency injection — invalid containers are compile errors |
| [`haywire-launcher`](../../../tools/haywire-launcher/) | Connect Haywire DI containers to `entry-script` CLI entry points |
| [`iso-crypto`](../../../tools/iso-crypto/) | Isomorphic cryptography for Node.js and Browser |
| [`lease-cache`](../../../tools/lease-cache/) | Read-through caching on Valkey or Redis with leases: one load per key across every instance, and a load that finishes after an invalidation never caches its outdated value |
| [`mocha-chain`](../../../tools/test-chain/mocha-chain/) | Type-safe Mocha hook chaining with typed context propagation |
| [`vitest-chain`](../../../tools/test-chain/vitest-chain/) | Type-safe Vitest hook chaining with typed context propagation |
| [`test-chain-core`](../../../tools/test-chain/test-chain-core/) | Framework-agnostic internals shared by `mocha-chain` and `vitest-chain` |
| [`normalized-react-query`](../../../tools/normalized-react-query/) | Type-safe React Query wrappers that enforce consistent key/query pairing |
| [`parse-cwd`](../../../tools/parse-cwd/) | Resolve and validate a working directory from string, URL, or undefined |
| [`punycode-esm`](../../../tools/punycode-esm/) | ESM port of the Punycode encoding library |
| [`static-emitter`](../../../tools/static-emitter/) | Typed EventEmitter/EventTarget for Node.js and Browser |
| [`unknown-error`](../../../tools/unknown-error/) | Convert caught `unknown` values to real Errors, and walk or format cause chains, without throwing |
| [`weighted-rendezvous-hash`](../../../tools/constant-consistent-hash/weighted-rendezvous-hash/) | Weighted rendezvous hashing for any set of nodes, in any order |


### Leyman

| Package | Description |
|---------|-------------|
| [`eslint-config`](../../../leyman/eslint-config) | Very opinionated eslint config used internally for package linting |
| [`expect`](../../../leyman/expect) | Pre-configured chai assertions for internal tests |
| [`main`](../../../leyman/main) | Workaround for installing "global" packages, and executing repo-wide tasks |

### Docs

| Package | Description |
|---------|-------------|
| [`docs`](../../../docs) | Documentation site, with every code example type-checked against the packages it documents |

### E2E

| Package | Description |
|---------|-------------|
| [`eslint-config-schema`](../../../e2e/eslint-config-schema) | Checks that eslint-config's hand-written package.json schema matches what juniper builds |
| [`normalized-react-query-ssr`](../../../e2e/normalized-react-query-ssr) | Checks that normalized-react-query's preloading carries across a server render into client hydration |
| [`iso-crypto-browser`](../../../e2e/iso-crypto-browser) | Checks that iso-crypto's browser build runs on web APIs alone, with no Node.js APIs |
| [`published-entrypoints`](../../../e2e/published-entrypoints) | Imports every entry point of every published package from the files it publishes, with only its runtime dependencies |
| [`unknown-error-comparison`](../../../e2e/unknown-error-comparison) | Runs unknown-error and the libraries it is compared to through the same edge cases, to keep its comparison table accurate |
| [`unknown-error-browser`](../../../e2e/unknown-error-browser) | Checks that unknown-error runs in real browsers, with and without `Error.isError` |
