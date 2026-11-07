---
name: create-package
description: Creating a new package in the monorepo
---

# Creating a New Package

Generate it under `tools/` or `apps/` (see the [projects skill](../projects/SKILL.md)):

```bash
nx g @leyman/nx-plugin:package tools/my-lib --description "Does things." --published
pnpm i                          # the generator runs this, unless --skipInstall
nx sync                         # adds the tsconfig references
nx run @leyman/main:lifecycle   # adds the orchestration targets to project.json
```

The [`@leyman/nx-plugin` README](../../../leyman/nx-plugin/README.md#package) lists its options. `nx.json` sets this repository's defaults (`config: leyman/main/nx-plugin.json`, the repository URL, author, license, and `@typescript/native` in `devDependencies`), so the usual choices are only `--published`, `--floor` (Node.js major, default 22), `--test` (`mocha`, `vitest` or `none`) and `--name` (default: the directory's last part).

It writes `package.json` (versions from the catalog or `workspace:^`), `tsconfig.json` (the support floor's `@leyman/configs/tsconfig.node-<major>.json` when published, else `tsconfig.build.json`; see [Support floors](../typescript/SKILL.md#support-floors)), `src/index.ts`, `test/tsconfig.json` and a first spec in `test/unit/`, `eslint.config.js`, a README stub, `LICENSE` when published, and a `project.json` declaring as `{}` the TypeScript targets the plugin infers from those files. Then adapt it:

| What | Notes |
|------|-------|
| Code | Replace the placeholder `packageName` export and its spec. Where files go decides what is cached; see [Project layout and caching](../nx-tasks-reference/SKILL.md#project-layout-and-caching). For a library with DI, see `tools/haywire`; for a CLI, `apps/barrelify` and the [cli skill](../cli/SKILL.md). |
| `package.json` | Rename `src/index.ts`, `exports` and `types` to the package's own entry name if it has one (e.g. `./dist/parse-cwd.js`). `files` is the allow-list of what is published, which is also what workspace dependents get (see [`sync-injected`](../nx-tasks-reference/SKILL.md#sync-injected)): add any other entry points (`bin.mjs`, `out`, root `*.d.ts`) and `WHY-<PACKAGE>.md`. Check the result with `pnpm pack --dry-run`; [`check-package`](../nx-tasks-reference/SKILL.md#check-package) fails on a top-level path that is neither published nor known not to be. Add `keywords`, and point `homepage` at the docs site page once it has one. Add dependencies with [install-package](../install-package/SKILL.md). |
| `project.json` | Add any work target the TypeScript ones don't cover (`barrelify`, `populate-files`...) as `{}` (see [nx-tasks-reference](../nx-tasks-reference/SKILL.md)). After the files change (a new `test/integration/`, say), `nx run @leyman/main:lifecycle` re-declares the TypeScript ones, as it runs `nx-plugin-targets` first. |
| `README.md` | Required. See [writing-readmes](../writing-readmes/SKILL.md). Its first paragraph repeats the `package.json` `description`. |

## Then

Also add it to the package lists (the [projects skill](../projects/SKILL.md) says how), and a changeset if the package will be published (see [versioning](../versioning/SKILL.md)). A published package also goes in the `devDependencies` of [`e2e/published-entrypoints`](../../../e2e/published-entrypoints) (`workspace:^`), whose test fails for any public package missing there. Nx caches that test on its own inputs, so a passing cached run can hide this: run it with `--skip-nx-cache` after making a package public.

## E2E packages

A test-only package under `e2e/` checks other workspace packages together, e.g. a pairing that can't depend on each other directly. Copy `e2e/eslint-config-schema`. Compared to a regular package:

- `package.json`: named `@leyman/e2e-<name>`, `"private": true`, no `exports`, and only `devDependencies` (including the packages under test, via `workspace:^`).
- No `src/`, root `tsconfig.json` or `files`. Tests go in `test/integration/`.
- `project.json` targets: `biome`, `eslint`, `tsc-test`, `mocha-integration-test`. No `tsc` or `sync-injected` (nothing to build), and no `coverage-report` (no source of its own to cover).
- Import the packages under test by their public exports only. Add an export to a package if needed, rather than reaching into its `dist/`.

## Demo packages

A worked example under `demos/` shows how to use open-source projects and services well, e.g. a read-through cache on Valkey. Unlike `e2e/`, a demo has source of its own: the example is the code, and its README explains the implementation (why it is built this way, what was learned, what it doesn't cover) rather than an API. Copy `demos/read-through-cache`. Compared to a regular package:

- `package.json`: named `@leyman/demo-<name>`, `"private": true`, with `exports` and `files` like a regular package: the docs site depends on it, to type-check its examples. No `repository` object or changeset: it is never published.
- `project.json` targets: as a regular package, minus `check-package` (nothing is published). Keep `sync-injected`: without it, the docs site's copy of the demo has no `dist` in a fresh install (as in Dagger), and its examples fail to type-check.
- Use [haywire](../../../tools/haywire/) once a demo has several moving parts, not by default: real choices between implementations, or resources it shares with the application (the bar in [coding-patterns](../coding-patterns/SKILL.md#2-composition-is-part-of-the-design)). Then each choice is one binding (e.g. memory tier: none, local, synced), so a demo is a module the reader composes, and tests swap one feature at a time with `replaceBinding()`. Take the application's resources (connections, clients) as bound instances, which the container never closes, so a demo can share them. See `demos/read-through-cache`. With nothing to compose, plain functions are clearer: see `demos/blake3-wasm`.
- Full tests and 100% coverage, like any package. Test against the real services, never mocks: they run as devcontainer sidecars (`.devcontainer/docker-compose.yml`), and Dagger binds the same images under the same hostnames for `test-ci` (`dagger/main.go`). A new service needs both, pinned to the same digest (see the [devcontainer skill](../devcontainer/SKILL.md#version-parity-devcontainer--dagger)).
- Tests share each service with other test files, other worktrees' runs never (each worktree has its own sidecars). Isolate by key prefix or similar, rather than clearing the service.
- A demo made of several packages (e.g. a spec, a client and a server) goes in a directory of its own (`demos/openapi/`), with a README for the whole, and one per package. Each directory of packages is listed in `pnpm-workspace.yaml` (`demos/openapi/*`).
- Advertise it: a row in the root README's Demos table, and a docs site page (see the [docs-site skill](../docs-site/SKILL.md#documented-packages)).

## One package in several languages

A package implemented in more than one language is a directory named after the package, holding one project per language, beside the vectors they share (e.g. `tools/constant-consistent-hash/`, `apps/genever/`):

- `ts/`, `go/`, `rust/`: one implementation each. `wasm/` is a TypeScript package calling the Rust one.
- `test-vectors/`: inputs and expected results every implementation runs, as an npm package. Other languages read its JSON by path (a Go module or crate wrapping it is fine while the implementation is unpublished; see below). The TypeScript implementation computes the expected values once, and they are committed. An implementation never regenerates the values it is tested against.
- Other packages built on it, such as `weighted-rendezvous-hash` or `load-populate-files`, stay beside them under their own names.
- `README.md`: what every implementation promises, whatever its language (the format it reads and writes, its rules), and a table of the projects. Each project still has its own README.

A new language's implementation goes in that directory, not inside the package that first needs it, so the package's format stays in one place.

## Go projects

Nx is not limited to TypeScript. Copy `tools/constant-consistent-hash/go`. Go is in the devcontainer and the Dagger pipeline (see the [devcontainer skill](../devcontainer/SKILL.md#version-parity-devcontainer--dagger)), and the gonx plugin makes a project of every `go.mod` (see [Go projects](../nx-tasks-reference/SKILL.md#go-projects)). Compared to a regular package:

- No `package.json`: pnpm doesn't need to know about it. Add a `project.json` named `@leyman/<name>` for the targets gonx doesn't infer.
- `go.mod`: module `github.com/JacobLey/leyman/<path>`, with a `go` directive no newer than the pinned Go version (Dagger sets `GOTOOLCHAIN=local`, so it never downloads a newer toolchain). A released module's directive is its support floor: the oldest Go it can support without losing functionality, `go 1.24` unless it needs newer. CI tests each released module on `go 1.24` with Go 1.24 (`goFloorTest` in `dagger/main.go`), since a newer Go's `go vet` doesn't catch newer standard library APIs or behaviour.
- Depend on another workspace Go module with `require <module> v0.0.0` plus `replace <module> => ../<path>`, and import it. gonx infers the Nx dependency from the import. To share data with TypeScript, read the file by relative path from the tests, and list the project holding it under `implicitDependencies` in `project.json`, so `go-test` (which hashes `^dependency-files`) reruns when it changes (see `apps/genever/go`). A published module can't require an unpublished one, so this is the way for a released module. An unreleased one may instead give the other project a `go.mod` and `//go:embed` the data (see `tools/constant-consistent-hash/test-vectors`).
- Source and `_test.go` files at the project root.
- `project.json` targets: `biome` (formats `project.json`), `gofmt`, and `go-coverage-report` when it has tests (see the [Go template](../nx-tasks-reference/SKILL.md#go-project)). `go-lint` and `go-test` are inferred. No `tsconfig.json`, `eslint.config.js` or TypeScript targets.
- Not released by default. To release one, add a `VERSION` and `CHANGELOG.md` and the `check-go-release` target (see the [versioning skill](../versioning/SKILL.md#go-modules)); every workspace module it requires must be released too.

## Rust projects

Copy `tools/constant-consistent-hash/rust`, or `test-vectors` for a crate with only data. Rust is in the devcontainer and the Dagger pipeline (see the [devcontainer skill](../devcontainer/SKILL.md#version-parity-devcontainer--dagger)), and the repo's plugin makes targets of every `Cargo.toml` (see [Rust projects](../nx-tasks-reference/SKILL.md#rust-projects)). Compared to a regular package:

- `Cargo.toml`: add the crate to `members` in the root `Cargo.toml`, take `edition`, `rust-version`, `license` and `publish` from the workspace (`edition.workspace = true`), and set `[lints] workspace = true`. There is one `Cargo.lock` and one `target/`, both at the root. After changing dependencies run `cargo check --workspace` and commit `Cargo.lock`.
- Depend on another crate of the workspace with `name = { path = "../name" }`. The plugin infers the Nx dependency from that. To share data with TypeScript, give the other project a `Cargo.toml` too, and `include_str!` the data (see `tools/constant-consistent-hash/test-vectors`).
- Source in `src/`, tests in `tests/`.
- `project.json`, named `@leyman/<name>`, targets: `biome` (formats `project.json`), `rustfmt`, and `rust-coverage-report` when it has tests (see the [Rust template](../nx-tasks-reference/SKILL.md#rust-project)). `rust-clippy`, `rust-test` and `rust-wasm` are inferred. No `tsconfig.json`, `eslint.config.js` or TypeScript targets.
- No `unsafe`: it is denied across the workspace. Only bindings allow it, in a file that holds nothing else: `#[wasm_bindgen]`'s generated code, or a C ABI's raw pointers.
- No `package.json`, unless TypeScript uses it.
- Not published: nothing deploys crates yet.

### Calling Rust from TypeScript

A crate that depends on `wasm-bindgen` also gets `rust-wasm`, which builds `dist/`. Keep it on `wasm32` only, under `[target.'cfg(target_arch = "wasm32")'.dependencies]`, with the bindings in a logic-free `src/wasm.rs`: `cargo llvm-cov` runs natively and never sees that file, so tests through TypeScript are what cover it. Pin it exactly, to the `wasm-bindgen-cli` version in the toolchain.

Give that crate a minimal `package.json` exporting `dist/` (with `sync-injected` in its targets, and `dist` in `files`), and wrap it in a regular TypeScript package with a `workspace:^` dependency, which also gives Nx the build order. Copy `tools/constant-consistent-hash/wasm`: its `node` and `browser` entry points each load the `.wasm` their own way. To run it on a frontend, copy `e2e/constant-consistent-hash-wasm-browser`. For a dependency on a crate, a worker and tests in browsers, see `demos/blake3-wasm`.

### Calling Rust from Go

Go runs the same `wasm32` build through [wazero](https://wazero.io), with no cgo. Copy `demos/blake3-go`:

- The crate builds a `cdylib` with no `wasm-bindgen`, so `rust-wasm` copies the bare `.wasm` to `dist/`. Its exports are a C ABI (`alloc`, `dealloc` and the functions themselves, over pointers into WASM's memory) in a logic-free `src/ffi.rs`, on `wasm32` only, which tests through Go cover.
- The crate's directory is a Go module too, whose one file `//go:embed`s `dist/`'s `.wasm`. A Go project that imports it gets the Nx dependency from gonx, so the crate builds first, and `go-test` hashes `^rustSource`, so it reruns when the crate changes.
