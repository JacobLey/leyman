---
name: projects
description: Understanding the various projects/packages available
---

# Projects

A project is any directory with a `project.json`. All current projects are TypeScript packages with a `package.json` and a README.md.

- `tools/`: libraries consumed via `import`.
- `apps/`: CLIs, Nx plugins, and larger packages that are used other than by plain `import`.
- `leyman/`: private, repo-internal packages that are never published.

## Packages

**When you add or remove a package, update the table in this file.** Add the new row in alphabetical order within the correct section (Apps, Tools, or Leyman). The description should match the one-line subtitle in the package's README.md.

See each package's README.md for full usage documentation.

### Apps

| Package | Description |
|---------|-------------|
| [`barrelify`](../../../apps/barrelify/) | Auto-generate TypeScript barrel (`index.ts`) files |
| [`juniper`](../../../apps/juniper/) | JSON Schema builder with static TypeScript inference |
| [`juniper-validator`](../../../apps/juniper-validator/) | StandardSchema-compliant validator wrapping Juniper schemas |
| [`nx-lifecycle`](../../../apps/nx-lifecycle/) | Nx plugin for managing ordered task dependency lifecycles |
| [`populate-files`](../../../apps/populate-files/populate-files/) | Write dynamic content to static files with CI sync checking |
| [`load-populate-files`](../../../apps/populate-files/load-populate-files/) | Load a config file and run `populate-files` from CLI |

### Tools

| Package | Description |
|---------|-------------|
| [`common-proxy`](../../../tools/common-proxy/) | Synchronously expose ESM-backed functions from CommonJS |
| [`default-import`](../../../tools/default-import/) | Correctly extract default exports from CJS modules in ESM |
| [`entry-script`](../../../tools/entry-script/) | Safe CLI entry point pattern — runs only as the Node entrypoint |
| [`enum-to-array`](../../../tools/enum-to-array/) | Convert TypeScript enums to typed arrays of keys/values |
| [`find-import`](../../../tools/find-import/) | Find and load the first matching JS/JSON file in parent directories |
| [`format-file`](../../../tools/format-file/) | Format file content via Biome or Prettier |
| [`haywire`](../../../tools/haywire/) | Type-safe dependency injection — invalid containers are compile errors |
| [`haywire-launcher`](../../../tools/haywire-launcher/) | Connect Haywire DI containers to `entry-script` CLI entry points |
| [`iso-crypto`](../../../tools/iso-crypto/) | Isomorphic cryptography for Node.js and Browser |
| [`mocha-chain`](../../../tools/test-chain/mocha-chain/) | Type-safe Mocha hook chaining with typed context propagation |
| [`vitest-chain`](../../../tools/test-chain/vitest-chain/) | Type-safe Vitest hook chaining with typed context propagation |
| [`test-chain-core`](../../../tools/test-chain/test-chain-core/) | Framework-agnostic internals shared by `mocha-chain` and `vitest-chain` |
| [`named-patch`](../../../tools/named-patch/) | Testable monkey-patching via named function wrappers |
| [`normalized-react-query`](../../../tools/normalized-react-query/) | Type-safe React Query wrappers that enforce consistent key/query pairing |
| [`parse-cwd`](../../../tools/parse-cwd/) | Resolve and validate a working directory from string, URL, or undefined |
| [`punycode-esm`](../../../tools/punycode-esm/) | ESM port of the Punycode encoding library |
| [`sinon-typed-stub`](../../../tools/sinon-typed-stub/) | Type-safe Sinon spy, stub, and mock wrappers |
| [`static-emitter`](../../../tools/static-emitter/) | Typed EventEmitter/EventTarget for Node.js and Browser |


### Leyman

| Package | Description |
|---------|-------------|
| [`eslint-config`](../../../leyman/eslint-config) | Very opinionated eslint config used internally for package linting |
| [`expect`](../../../leyman/expect) | Pre-configured chai assertions for internal tests |
| [`main`](../../../leyman/main) | Workaround for installing "global" packages, and executing repo-wide tasks |
