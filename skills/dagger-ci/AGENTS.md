# Dagger CI

> Dagger docs: [dagger.io](https://dagger.io/) · [Go SDK](https://docs.dagger.io/sdk/go)
> CI config: [`../../dagger/`](../../dagger/) · GitHub Actions: [`.github/workflows/test.yml`](../../.github/workflows/test.yml)

## Motivation

Running builds and test suites locally is a great start to making sure software works. But "we can't deploy your machine", and can't trust that the tests run locally didn't accidentally rely on unexpected side effects (e.g. a new dependency that didn't make it into version control).

CI workflows fix that (this project uses Github Actions), but then when CI fails it is incredibly hard/slow to debug.

Dagger allows us to run the full CI workflow locally (our Github Actions just point to Dagger) and iterate faster. Now Dagger can be trusted to create
a fully reproducible build that is known to work.

## What Dagger Does

Dagger runs the full CI pipeline inside a container for reproducibility. It:
1. Installs Node and PNPM in a Debian container
    * Versions are hardcoded, and should match this [devcontainer's](../../.devcontainer/Dockerfile) setting.
2. Copies source, installs dependencies (`pnpm i`)
3. Runs `nx run-many -t build` (all packages)
4. In parallel:
   - Runs `nx run-many -t test` + `nx run-many -t coverage-report` (test + coverage)
   - Runs `nx run @leyman/main:lifecycle` (validates lifecycle config is up to date)

**If Dagger passes, CI passes.**

## Running Locally

```bash
# Full CI simulation (same as GitHub Actions)
dagger-test
# PATH based reference to scripts/commands/dagger-test

# Set up Dagger for development (initializes module dependencies)
dagger-develop
# PATH based reference to scripts/commands/dagger-develop
```

> **Tip:** Run `test-ci` first — Much faster for iteration. Use Dagger only to confirm the final result before push. Dagger is also much harder to debug directly (but still easier than cloud CI)

## Dagger Cloud (Optional)

```bash
dagger login # connect to Dagger Cloud for pipeline visualization and caching
```

With Dagger Cloud, you get a web UI showing each pipeline step and its logs, which is useful for debugging CI failures.

## Module Structure

```
dagger/
├── test-and-build/    ← main CI module (Go)
│   ├── main.go        ← pipeline definition
│   └── dagger.json
└── modules/
    ├── node/          ← Node.js installation
    ├── pnpm/          ← PNPM installation
    └── debian/        ← base Debian container
```

## When to Use Dagger vs Nx

| Use | When |
|-----|------|
| `test-only` | During development — fast feedback, uses local cache |
| `scripts/commands/dagger-test` | Before pushing — confirms full CI will pass |
| `test-ci` | Middle ground — runs full tests + coverage without containerization |

## Versions

- Dagger engine: Similar to Node/PNPM, should match version of [Dockerfile](../../.devcontainer/Dockerfile)

These are set in `dagger/test-and-build/main.go`. When upgrading, update both the Go source and the `dagger.json` engine version.

## Troubleshooting

**Container fails but Nx passes** — likely an environment difference (missing binary, wrong Node version, network issue). Check the Dagger logs carefully for the specific step that failed.

**"dagger: command not found"** — Dagger CLI must be installed. In the DevContainer it is available automatically.

**Slow first run** — Dagger downloads and caches container layers on the first run. Subsequent runs use the cache.
