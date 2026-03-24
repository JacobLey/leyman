# Leyman

An Nx monorepo of TypeScript libraries and tools for Node.js ESM environments.

> **First time here?** Open this repo in VSCode — it will prompt you to reopen in the [DevContainer](.devcontainer/), which sets up Node, PNPM, and all tooling automatically.

## Packages

Full index of packages can be found [here](./skills/projects/AGENTS.md).

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
dagger call --mod ./dagger/test-and-build/ --source . run
```

Run `test-ci` first — it's faster for iteration. Use Dagger to confirm before pushing.

See all aliased (via PATH set during [Devcontainer setup](./.devcontainer/Dockerfile)) scripts in the [/scripts/commands](./scripts/commands) directory.

## Coding Agents

The `.claude/` directory is **not version-controlled** (it's in `.gitignore`). This makes it a safe place to store personal credentials and user-specific configuration — for example, API keys for Claude Code. This is helpful when persisting auth across devcontainer sessions.

Because `.claude/` is gitignored, anything that should be shared across contributors (prompts, settings, hooks) must live elsewhere in the repo. Use the [`skills/`](./skills/) directory or [`AGENTS.md`](./AGENTS.md) for shared agent guidance.

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
| [Mocha](https://mochajs.org/) + [Chai](https://www.chaijs.com/) | Testing |
| [C8](https://github.com/bcoe/c8) | Coverage (100% required) |
| [Dagger](https://dagger.io/) | CI pipeline |
| [Changesets](https://github.com/changesets/changesets) | Versioning and changelogs |
