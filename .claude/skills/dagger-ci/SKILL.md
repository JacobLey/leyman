---
name: dagger-ci
description: Running CI locally with Dagger
---

# Dagger CI

> Dagger docs: [dagger.io](https://dagger.io/) · [Go SDK](https://docs.dagger.io/sdk/go)
> CI config: [`../../../dagger/`](../../../dagger/) · GitHub Actions: [`.github/workflows/test.yml`](../../../.github/workflows/test.yml)

GitHub Actions only calls Dagger, so the same pipeline runs locally in a clean container. That catches anything that only works because of local state (untracked files, stale `dist/`, a dependency missing from the lockfile).

## Pipeline (`dagger/test-and-build/main.go`)

1. Debian + Node + pnpm (versions must match the devcontainer, see the [devcontainer skill](../devcontainer/SKILL.md))
2. Copy the source (respecting `.gitignore`), `pnpm i`
3. `nx run-many -t build`
4. In parallel: `test-ci`, and `nx run @leyman/main:lifecycle` (fails if generated lifecycle config is out of date)

**If Dagger passes, CI passes.**

## Running Locally

```bash
# Full CI simulation (same as GitHub Actions)
dagger-test

# Regenerate Dagger Go SDK bindings (after editing the Go modules)
dagger-develop
```

Run `test-ci` first; it is much faster. Use Dagger to confirm before pushing. Dagger needs Docker (available in the devcontainer via docker-outside-of-docker). The first run is slow while layers are cached.

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

If Dagger fails but `test-ci` passes locally, suspect an environment difference: a file that is gitignored or untracked, or a version mismatch between the devcontainer and Dagger.
