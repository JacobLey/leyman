# Projects

A project (aka package) is any directory in this repo that has a `project.json` file (which plugs it into Nx runners).

_In practice_ all projects are JS based, and therefore also have `package.json`.

Every project should have a README.md.

Most smaller "lib-based" projects go in the `/tools` directory. These should be fairly simple libraries, with a straightforward README.

More complicated projects (i.e. includes a WHY-\<PROJECT\>.md) or those that used outside of traditional `import` (e.g. CLIs) should go in the `/apps` directory.

The two other exceptions are in the `/leyman` directory, which manages meta configuration for this repo, and will never be deployed. 

## Packages

**When you add or remove a package, update the table in this file.** Add the new row in alphabetical order within the correct section (Apps, Tools, or Leyman). The description should match the one-line subtitle in the package's README.md.

See each package's README.md for full usage documentation.

### Apps

| Package | Description |
|---------|-------------|
| [`barrelify`](../../apps/barrelify/) | Auto-generate TypeScript barrel (`index.ts`) files |
| [`juniper`](../../apps/juniper/) | JSON Schema builder with static TypeScript inference |
| [`juniper-validator`](../../apps/juniper-validator/) | StandardSchema-compliant validator wrapping Juniper schemas |
| [`nx-lifecycle`](../../apps/nx-lifecycle/) | Nx plugin for managing ordered task dependency lifecycles |
| [`pnpm-dedicated-lockfile`](../../apps/pnpm-dedicated-lockfile/) | Generate per-package lockfiles from the monorepo lockfile |
| [`populate-files`](../../apps/populate-files/populate-files/) | Write dynamic content to static files with CI sync checking |
| [`load-populate-files`](../../apps/populate-files/load-populate-files/) | Load a config file and run `populate-files` from CLI |

### Tools

| Package | Description |
|---------|-------------|
| [`common-proxy`](../../tools/common-proxy/) | Synchronously expose ESM-backed functions from CommonJS |
| [`default-import`](../../tools/default-import/) | Correctly extract default exports from CJS modules in ESM |
| [`entry-script`](../../tools/entry-script/) | Safe CLI entry point pattern — runs only as the Node entrypoint |
| [`enum-to-array`](../../tools/enum-to-array/) | Convert TypeScript enums to typed arrays of keys/values |
| [`find-import`](../../tools/find-import/) | Find and load the first matching JS/JSON file in parent directories |
| [`format-file`](../../tools/format-file/) | Format file content via Biome or Prettier |
| [`haywire`](../../tools/haywire/) | Type-safe dependency injection — invalid containers are compile errors |
| [`haywire-launcher`](../../tools/haywire-launcher/) | Connect Haywire DI containers to `entry-script` CLI entry points |
| [`iso-crypto`](../../tools/iso-crypto/) | Isomorphic cryptography for Node.js and Browser |
| [`mocha-chain`](../../tools/mocha-chain/) | Type-safe Mocha hook chaining with typed context propagation |
| [`named-patch`](../../tools/named-patch/) | Testable monkey-patching via named function wrappers |
| [`normalized-react-query`](../../tools/normalized-react-query/) | Type-safe React Query wrappers that enforce consistent key/query pairing |
| [`nx-plugin-handler`](../../tools/nx-plugin-handler/) | Error-handling wrapper for Nx executor implementations |
| [`parse-cwd`](../../tools/parse-cwd/) | Resolve and validate a working directory from string, URL, or undefined |
| [`punycode-esm`](../../tools/punycode-esm/) | ESM port of the Punycode encoding library |
| [`sinon-typed-stub`](../../tools/sinon-typed-stub/) | Type-safe Sinon spy, stub, and mock wrappers |
| [`static-emitter`](../../tools/static-emitter/) | Typed EventEmitter/EventTarget for Node.js and Browser |


### Leyman

| Package | Description |
|---------|-------------|
| [`eslint-config`](../../leyman/eslint-config) | Very opinionated eslint config used internally for package linting |
| [`main`](../../leyman/main) | Workaround for installing "global" packages, and executing repo-wide tasks |

