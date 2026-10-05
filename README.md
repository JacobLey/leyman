# Leyman

An Nx monorepo of TypeScript libraries and tools for Node.js ESM environments.

> **First time here?** Open this repo in VSCode — it will prompt you to reopen in the [DevContainer](.devcontainer/), which sets up Node, PNPM, and all tooling automatically. Day-to-day work happens in git worktrees; see the [worktrees skill](./.claude/skills/worktrees/SKILL.md).

## Packages

Published to npm:

| Package | Description | Source |
|---|---|---|
| [`barrelify`](https://www.npmjs.com/package/barrelify) | Generate and CI-verify TypeScript barrel (index.ts) files with the correct ESM/CJS import extensions. | [`apps/barrelify`](./apps/barrelify) |
| [`common-proxy`](https://www.npmjs.com/package/common-proxy) | Wrap an ESM import so it is synchronously available as a promise-returning function in CommonJS. | [`tools/common-proxy`](./tools/common-proxy) |
| [`default-import`](https://www.npmjs.com/package/default-import) | Properly handle CJS imports in ESM. | [`tools/default-import`](./tools/default-import) |
| [`entry-script`](https://www.npmjs.com/package/entry-script) | Modular control for entry script execution. | [`tools/entry-script`](./tools/entry-script) |
| [`enum-to-array`](https://www.npmjs.com/package/enum-to-array) | Convert Typescript Enums to a strongly typed array. | [`tools/enum-to-array`](./tools/enum-to-array) |
| [`find-import`](https://www.npmjs.com/package/find-import) | Find and load first instance of js/json in parent directories. | [`tools/find-import`](./tools/find-import) |
| [`format-file`](https://www.npmjs.com/package/format-file) | Utility API to format files via biome | [`tools/format-file`](./tools/format-file) |
| [`haywire`](https://www.npmjs.com/package/haywire) | Compile-time checked dependency injection for TypeScript — no decorators, no reflect-metadata, no global state. | [`tools/haywire`](./tools/haywire) |
| [`haywire-launcher`](https://www.npmjs.com/package/haywire-launcher) | Instantiate and execute your script in one line. | [`tools/haywire-launcher`](./tools/haywire-launcher) |
| [`iso-crypto`](https://www.npmjs.com/package/iso-crypto) | Isomorphic cryptography for browsers and Node.js — one API over WebCrypto and node:crypto for hashing, AES (including GCM), PBKDF2/HKDF key derivation and ECDH. | [`tools/iso-crypto`](./tools/iso-crypto) |
| [`juniper`](https://www.npmjs.com/package/juniper) | Build JSON Schemas in TypeScript with inferred static types — strict, Ajv-ready, JSON Schema 2020-12 and OpenAPI 3.0 output. | [`apps/juniper`](./apps/juniper) |
| [`juniper-validator`](https://www.npmjs.com/package/juniper-validator) | StandardSchema compliance for juniper. | [`apps/juniper-validator`](./apps/juniper-validator) |
| [`load-populate-files`](https://www.npmjs.com/package/load-populate-files) | Load and dynamically populate file content | [`apps/populate-files/load-populate-files`](./apps/populate-files/load-populate-files) |
| [`mocha-chain`](https://www.npmjs.com/package/mocha-chain) | Chain mocha BDD methods together for deterministic and type safe tests. | [`tools/test-chain/mocha-chain`](./tools/test-chain/mocha-chain) |
| [`named-patch`](https://www.npmjs.com/package/named-patch) | Higher order function for patching named export functions. | [`tools/named-patch`](./tools/named-patch) |
| [`normalized-react-query`](https://www.npmjs.com/package/normalized-react-query) | Type-safe query definitions for TanStack Query — define each key and fetcher once, and link related queries so they prefetch together. | [`tools/normalized-react-query`](./tools/normalized-react-query) |
| [`nx-lifecycle`](https://www.npmjs.com/package/nx-lifecycle) | Nx plugin that derives every dependsOn from declared lifecycle stages (build, test, …) and the targets bound to them. | [`apps/nx-lifecycle`](./apps/nx-lifecycle) |
| [`parse-cwd`](https://www.npmjs.com/package/parse-cwd) | Convert relative path or URL to full path | [`tools/parse-cwd`](./tools/parse-cwd) |
| [`populate-files`](https://www.npmjs.com/package/populate-files) | Dynamically populate file content | [`apps/populate-files/populate-files`](./apps/populate-files/populate-files) |
| [`punycode-esm`](https://www.npmjs.com/package/punycode-esm) | Typescript + ESM version of punycode.js | [`tools/punycode-esm`](./tools/punycode-esm) |
| [`sinon-typed-stub`](https://www.npmjs.com/package/sinon-typed-stub) | Utility methods to better typed sinon stubs | [`tools/sinon-typed-stub`](./tools/sinon-typed-stub) |
| [`static-emitter`](https://www.npmjs.com/package/static-emitter) | Statically typed event emitter. | [`tools/static-emitter`](./tools/static-emitter) |
| [`test-chain-core`](https://www.npmjs.com/package/test-chain-core) | Framework-agnostic internals for chaining test hooks with typed context | [`tools/test-chain/test-chain-core`](./tools/test-chain/test-chain-core) |
| [`vitest-chain`](https://www.npmjs.com/package/vitest-chain) | Chain vitest methods together for deterministic and type safe tests | [`tools/test-chain/vitest-chain`](./tools/test-chain/vitest-chain) |

Private workspace packages (shared configs and tooling) are listed in the [projects skill](./.claude/skills/projects/SKILL.md).

## Getting Started

```bash
# Install dependencies
pnpm i

# Build and test everything
test-ci
```

> **Nx is not globally installed.** It ships with `@leyman/main` and is on `PATH` automatically. Use `nx` directly — not `npx nx` or `pnpm exec nx`.

See [`AGENTS.md`](./AGENTS.md) for the full skill index.

## CI

This repo uses [Dagger](https://dagger.io/) for CI. To replicate CI locally:

```bash
dagger-test
# or equivalently:
dagger call --mod ./dagger test
```

Run `test-ci` first — it's faster for iteration. Use Dagger to confirm before pushing.

See all aliased (added to `PATH` by [`devcontainer.json`](./.devcontainer/devcontainer.json)) scripts in the [/scripts/commands](./scripts/commands) directory.

## Coding Agents

Agent docs start at [`AGENTS.md`](./AGENTS.md) (also linked as `CLAUDE.md`). In the devcontainer, Claude Code config (credentials, settings, memory) lives in `<main checkout>-worktrees/.shared/claude-config`, outside version control and shared by every worktree. See the [worktrees skill](./.claude/skills/worktrees/SKILL.md).

(If you use a different coding agent, PRs are welcome to support those directories).

## Contributing

1. Make your changes
2. Run `test-ci` to verify
3. Run `changeset` and follow the prompts to document your changes
4. Submit a PR — GitHub Actions runs Dagger automatically

## Tooling

| Tool | Role |
|------|------|
| [PNPM](https://pnpm.io/) | Package manager with workspace support |
| [Nx](https://nx.dev/) | Task runner with caching and dependency graph |
| [TypeScript](https://www.typescriptlang.org/) | Language (ESM, strict mode) |
| [SWC](https://swc.rs/) | Fast TypeScript compiler |
| [ESLint](https://eslint.org/) | Linting (opinionated, 15+ plugins) |
| [Biome](https://biomejs.dev/) | Formatting |
| [Mocha](https://mochajs.org/) + [Chai](https://www.chaijs.com/) (via `@leyman/expect`) | Testing |
| [C8](https://github.com/bcoe/c8) | Coverage (100% required) |
| [Dagger](https://dagger.io/) | CI pipeline |
| [Changesets](https://github.com/changesets/changesets) | Versioning and changelogs |
