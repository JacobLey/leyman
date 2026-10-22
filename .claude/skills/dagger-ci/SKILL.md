---
name: dagger-ci
description: Running CI locally with Dagger, and how releases to npm work
---

# Dagger CI

> Dagger docs: [dagger.io](https://dagger.io/) · [Go SDK](https://docs.dagger.io/sdk/go)
> CI config: [`../../../dagger/`](../../../dagger/) · GitHub Actions: [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml)

GitHub Actions only calls Dagger, so the same pipeline runs locally in a clean container. That catches anything that only works because of local state (untracked files, stale `dist/`, a dependency missing from the lockfile).

Nx decides what to build and test; Dagger only provides the environment. Keep pipeline logic in Nx targets, not in Go.

## Pipeline (`dagger/main.go`)

1. `node` image (pinned by digest) + pnpm, plus the Go toolchain copied from the `golang` image (pinned by digest), for Go projects, and the Postgres client tools (`psql`, `pg_dump`) from the PostgreSQL apt repository. Versions must match the devcontainer, see the [devcontainer skill](../devcontainer/SKILL.md)
2. `pnpm fetch` from the lockfile alone, then copy the source (filtered by `.gitignore`) and `pnpm install --offline`, carrying over the store and the metadata cache (the install checks the lockfile against the supply-chain policies). Source-only changes reuse the cached fetch.
3. `nx run-many -t build`, with Postgres bound already (`DATABASE_URL`): `prepare`, which the build runs, snapshots schemas from migrations (`schema-snapshot`)
4. In parallel: `test-ci`, and `nx run @leyman/main:lifecycle` (fails if generated lifecycle config is out of date). `test-ci` gets the services some tests run against (Valkey, and Postgres), bound under the same hostnames and with the same settings as the devcontainer's sidecars

**If Dagger passes, CI passes.**

## Running Locally

```bash
# Full CI simulation (same pipeline as GitHub Actions)
dagger-test

# Regenerate Dagger Go SDK bindings (after editing the module)
dagger-develop
```

Run `test-ci` first; it is much faster. Use Dagger to confirm before pushing. Dagger needs Docker (available in the devcontainer via docker-outside-of-docker). The first run is slow while layers are cached.

## Caching

- **Whole function calls are cached** (Dagger ≥0.19), keyed on the module's code, the arguments and the source directory's contents. Re-running `dagger-test` with nothing changed prints only `Ci.test CACHED` and returns in about a second; that means the same inputs already passed, not that nothing was checked. Failures are not cached. `Publish` is marked `+cache="never"` because its result depends on the npm registry.
- **Locally**, the Dagger engine persists, so unchanged steps (like `pnpm install`) are cached, but every Nx task runs: there is no Nx cache, so a test cannot pass by replaying an earlier result. It never reads the devcontainer's Nx cache either.
- **In GitHub Actions**, the engine starts cold every run. Nx results are kept between runs by running [`nx-cache-server.mjs`](../../../.devcontainer/nx-cache-server.mjs) on the runner, persisting its directory with `actions/cache`, and passing it to Dagger as a host service (`test --nx-cache=tcp://localhost:3000`). PRs read main's cache, never the reverse. Each cached result expires 7 days after it was stored (`NX_CACHE_MAX_AGE_DAYS`, which the server deletes at startup and never serves), and bumping `NX_CACHE_VERSION` in `ci.yml` discards everything at once.

## Releasing

Every push to `main` runs, after `test` passes:

- **`version`**: `dagger call version` applies pending changesets (bumps versions, writes changelogs), and the workflow opens or updates a "Version Packages" PR from the result. `dagger call version-notes` writes the PR body: each public package's version bump and its new changelog section. It needs full git history, which Dagger loads from the checkout as a `GitRepository`, so changelogs can cite the commit that added each changeset.
- **`publish`**: `dagger call publish` builds from scratch (no Nx cache), finds every public package whose version is not on npm, `pnpm pack`s it (resolving `workspace:`/`catalog:`), and publishes the tarball with `npm` using trusted publishing (OIDC) with provenance. It publishes one package at a time, each after the packages it depends on (all but `devDependencies`), and stops at the first that npm rejects, so nothing is published while a dependency it needs isn't. It prints `published <name>@<version>` for each package, and `failed <name>@<version>: <error>` for the one that failed (a failure is in the output, not the exit code). The workflow pushes a `name@version` tag for each one published, then fails if one didn't, so a rerun (which skips what is on npm) never leaves a release untagged. With nothing new to publish it does nothing, so merging a version PR is what triggers a release.
- **`docs`**: `dagger call docs export --path ./site` builds the [docs site](../../../docs/README.md), and the workflow deploys it to GitHub Pages (`actions/deploy-pages`, authenticated with OIDC). Requires Pages to be set to deploy from GitHub Actions in the repo settings.

Rehearse locally:

```bash
# What would be published, validated with `npm publish --dry-run`
dagger call --mod ./dagger publish --dry-run

# The docs site that would be deployed
dagger call --mod ./dagger docs export --path ./site

# What a version PR would change. A worktree's `.git` points outside it, so pass a normal clone
# (or a remote URL such as https://github.com/JacobLey/leyman); it versions that repo's HEAD.
dagger call --mod ./dagger version --repo=<clone> as-patch contents

# The body of that version PR
dagger call --mod ./dagger version-notes --repo=<clone>
```

## Module Structure

A single Go module, `ci`:

```
dagger/
├── main.go        ← pipeline definition
├── dagger.json
└── go.mod
```

If Dagger fails but `test-ci` passes locally, suspect an environment difference: a file that is gitignored or untracked, or a version mismatch between the devcontainer and Dagger.
