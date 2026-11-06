---
name: dagger-ci
description: Running CI locally with Dagger, how releases to npm work, and patching an older major version of a package (e.g. a security fix for v1 after v2 shipped)
---

# Dagger CI

> Dagger docs: [dagger.io](https://dagger.io/) · [Go SDK](https://docs.dagger.io/sdk/go)
> CI config: [`../../../dagger/`](../../../dagger/) · GitHub Actions: [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml)

GitHub Actions only calls Dagger, so the same pipeline runs locally in a clean container. That catches anything that only works because of local state (untracked files, stale `dist/`, a dependency missing from the lockfile).

Nx decides what to build and test; Dagger only provides the environment. Keep pipeline logic in Nx targets, not in Go.

## Pipeline (`dagger/main.go`)

1. `node` image (pinned by digest) + pnpm, plus the Go toolchain copied from the `golang` image (pinned by digest, with the prebuilt `golangci-lint` release, checked against a pinned checksum), for Go projects, the Rust toolchain from the `rust` image (pinned by digest, with the prebuilt `cargo-llvm-cov` and `wasm-bindgen` releases, checked against pinned checksums), for Rust projects, and the Postgres client tools (`psql`, `pg_dump`) from the PostgreSQL apt repository. Versions must match the devcontainer, see the [devcontainer skill](../devcontainer/SKILL.md)
2. `cargo fetch --locked`, `go mod download` and `pnpm fetch` from the lockfiles alone, then copy the source (filtered by `.gitignore`) and `pnpm install --offline`, carrying over the store and the metadata cache (the install checks the lockfile against the supply-chain policies). Source-only changes reuse the cached fetch.
3. `nx run-many -t build`, with Postgres bound already (`DATABASE_URL`): `prepare`, which the build runs, snapshots schemas from migrations (`schema-snapshot`)
4. In parallel: `test-ci`, `nx run @leyman/main:lifecycle` (fails if generated lifecycle config is out of date), and `floor-test` in [`e2e/published-entrypoints`](../../../e2e/published-entrypoints), which imports each published package on Node.js 22 when its `engines` allows it (`node22Image`, only its binary, at `NODE_22`). `test-ci` gets the services some tests run against (Valkey, and Postgres), bound under the same hostnames and with the same settings as the devcontainer's sidecars

**If Dagger passes, CI passes.**

## Running Locally

```bash
# Full CI simulation (same pipeline as GitHub Actions)
dagger-test

# Regenerate Dagger Go SDK bindings for editors (run on container creation, and by `prepare` for `@leyman/dagger-ci`)
dagger-develop
```

Run `test-ci` first; it is much faster. Use Dagger to confirm before pushing. Dagger needs Docker (available in the devcontainer via docker-outside-of-docker). The first run is slow while layers are cached.

## Caching

- **Whole function calls are cached** (Dagger ≥0.19), keyed on the module's code, the arguments and the source directory's contents. Re-running `dagger-test --uncached` with nothing changed prints only `Ci.test CACHED` and returns in about a second; that means the same inputs already passed, not that nothing was checked. A plain `dagger-test` never gets this, because its cache service argument differs between runs: with nothing changed it runs the function again, with Nx replaying results (about 40 seconds). Failures are not cached. `Publish` is marked `+cache="never"` because its result depends on the npm registry.
- **Locally**, the Dagger engine persists, so unchanged steps (like `pnpm install`) are cached. `dagger-test` also keeps Nx results in the `dagger-nx-cache` sidecar, shared between worktrees, so only tasks whose inputs changed run, as in CI. It holds only what Dagger built here, and never reads the devcontainer's Nx cache, whose results come from a different environment, or the hosted cache. So a test can pass by replaying an earlier result: run `dagger-test --uncached` to run every task, for a suspected missing Nx input or a last check before a release. A failed task is never cached. A container from before this sidecar existed needs a rebuild, and until then `dagger-test` says so.
- **In GitHub Actions**, the engine starts cold every run. Nx results come from the hosted cache ([`infra/nx-cache`](../../../infra/nx-cache/README.md)), through [`nx-cache-server.mjs`](../../../.devcontainer/nx-cache-server.mjs) running on the runner and passed to Dagger as a host service (`test --nx-cache=tcp://localhost:3000`). Its local directory starts empty every run: nothing is kept on GitHub's side. Every run reads from the hosted cache (once the `NX_CACHE_UPSTREAM` variable is set), and pushes to `main` write to it, with the job's GitHub OIDC token, so PRs read main's results, never the reverse. Each cached result expires 7 days after it was stored (`NX_CACHE_MAX_AGE_DAYS`, never served after that); emptying the bucket discards everything at once. Those runs also upload a result they read again once it is `NX_CACHE_REFRESH_AFTER_DAYS` old, so results in use never expire. `test` also runs nightly on `main` (`schedule` in `ci.yml`), writing like a push, so the cache stays warm through a quiet week. Weekly, `test-uncached` runs `test` with no Nx cache at all, so a cache input Nx doesn't hash shows up as a failure there. Dagger still only sees `tcp://localhost:3000`. The `docs` job reads the hosted cache too, never writing to it, so it reuses what `test` built for the same commit. `comparison-report.yml` is a separate nightly workflow, never on a PR or push, which reports on genever against other tools ([`e2e/genever-comparison`](../../../e2e/genever-comparison)): it holds no secrets, reads the hosted cache, and a second job commits the result to `refs/reports/comparison`, which the docs site's comparison page fetches. `deploy-nx-cache` deploys the hosted cache's Worker, from the `nx-cache` job on `main`, with no cache: its build takes seconds.

## Releasing

Every push to `main` runs, after `test` passes:

- **`fork-manifest-audit`**: `dagger call fork-manifest-audit` runs the [fork manifest](../fork-manifest/SKILL.md)'s audit from a source that keeps the files `New` leaves out, without `.git`. It runs on every call, since it resolves from the registry. The weekly `Fork manifest` workflow calls it, and a failure there blocks nothing.
- **`version`**: `dagger call version` applies pending changesets (bumps versions, writes changelogs), and the workflow opens or updates a "Version Packages" PR from the result. `dagger call version-notes` writes the PR body: each public package's version bump and its new changelog section. It needs full git history, which Dagger loads from the checkout as a `GitRepository`, so changelogs can cite the commit that added each changeset.
- **`publish`**: `dagger call publish` builds from scratch (no Nx cache), finds every public package whose version is not on npm, `pnpm pack`s it (resolving `workspace:`/`catalog:`), and publishes the tarball with `npm` using trusted publishing (OIDC) with provenance. A version below the package's `latest` goes under a `release-<major>` dist-tag ([patching an older major](#patching-an-older-major)). It publishes one package at a time, each after the packages it depends on (all but `devDependencies`), and stops at the first that npm rejects, so nothing is published while a dependency it needs isn't. It prints `published <name>@<version>` for each package, and `failed <name>@<version>: <error>` for the one that failed (a failure is in the output, not the exit code). The workflow pushes a `name@version` tag for each one published (with the `RELEASE_TAG_TOKEN` fine-grained PAT in the `npm` environment, since `GITHUB_TOKEN` can't push a tag whose commit's workflows differ from main's), then fails if one didn't, so a rerun (which skips what is on npm) never leaves a release untagged. With nothing new to publish it does nothing, so merging a version PR is what triggers a release.
- **`docs`**: `dagger call docs --nx-cache=tcp://localhost:3000 export --path ./site` builds the [docs site](../../../docs/README.md), and the workflow deploys it to GitHub Pages (`actions/deploy-pages`, authenticated with OIDC). Requires Pages to be set to deploy from GitHub Actions in the repo settings.

Rehearse locally:

```bash
# What would be published, validated with `npm publish --dry-run`
dagger call --mod ./dagger publish --dry-run

# The docs site that would be deployed (add --nx-cache=tcp://dagger-nx-cache:3000 after `docs` to reuse dagger-test's results)
dagger call --mod ./dagger docs export --path ./site

# What a version PR would change. A worktree's `.git` points outside it, so pass a normal clone
# (or a remote URL such as https://github.com/JacobLey/leyman); it versions that repo's HEAD.
dagger call --mod ./dagger version --repo=<clone> as-patch contents

# The body of that version PR
dagger call --mod ./dagger version-notes --repo=<clone>
```

## Patching an older major

Old majors are not maintained on an ongoing basis. Each `name@version` tag is a full snapshot (source, lockfile, Dagger module, devcontainer), so a branch is only created when a fix is needed. See [`SECURITY.md`](../../../SECURITY.md) for what is promised.

First check who it would help (npm's per-version downloads). If almost nobody is on that major, `npm deprecate` and an advisory may be enough. Otherwise:

1. If the latest major is affected, fix it on `main` first, with a regression test.
2. Cut `release/<package>-<major>.x` from the **newest** tag of that major, in a new worktree. An older starting point would reuse version numbers already on npm, and `publish` silently skips those.
3. If the tag predates release branches, its CI won't run them, so make the first commit a small hand port. A cherry-pick conflicts, and nothing more is needed for a one-off:
   - `ci.yml`: add `release/*` to `on.push.branches`, and let the `publish` job's `if` accept `refs/heads/release/*`
   - `ci.yml`: if its `Tag releases` step pushes with `GITHUB_TOKEN`, push to the `RELEASE_TAG_TOKEN` URL as the current step does, and set `persist-credentials: false` on the job's checkout, or the checkout's credential is used instead (a release branch's workflows differ from main's, so `GITHUB_TOKEN`'s push would be refused after npm has published). Keep how the step reads the publish output: its format changed, and the current step's parsing finds nothing in the old one, silently tagging nothing
   - `dagger/main.go`: add `--tag release-<major>` to the `npm publish` command, or npm refuses a version below `latest`
4. Apply the fix and a changeset, and delete any pending changesets the tag already had. Don't fix unrelated breakage from age. Rerun a timeout in an unrelated package first, as old tags keep their flaky tests; remove a package whose unrelated tests really no longer pass from the branch instead.
5. Run `changeset version` on the branch, the one place to run it by hand: the `version` job is `main` only. Check that only the intended packages were bumped.
6. Run `test-ci`, `dagger-test` and `dagger call --mod ./dagger publish --dry-run`, and open a PR into the branch, which runs `test`.
7. Allow that one branch to use the `npm` environment. Without this, `publish` fails at the environment and nothing is released.

   ```bash
   gh api --method POST repos/JacobLey/leyman/environments/npm/deployment-branch-policies \
     -f name='release/<package>-<major>.x' -f type=branch
   ```

8. Merge. `test` and `publish` run, and `publish` uses the `release-<major>` dist-tag and pushes the release tag. Check the output says `published` for what you expected. The version can take a minute or two to appear on npm. `version`, `docs` and `nx-cache` stay `main` only, so the docs site is untouched.
9. Remove the branch from the environment, and delete the branch; its release tag keeps the code. Don't merge it into `main`.

   ```bash
   gh api repos/JacobLey/leyman/environments/npm/deployment-branch-policies
   gh api --method DELETE repos/JacobLey/leyman/environments/npm/deployment-branch-policies/<id>
   ```

No npm settings change: a trusted publisher names the repository, workflow file (`ci.yml`) and environment (`npm`), not a branch, so keep publishing in that job. Don't publish from a machine: it has no provenance, which consumers using pnpm's `trustPolicy: no-downgrade` reject.

For a vulnerability that isn't public yet, develop the fix in a [private security advisory fork](https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/collaborating-in-a-temporary-private-fork-to-resolve-a-repository-security-vulnerability), test locally, then merge and publish together.

## Module Structure

A single Go module, `ci`:

```
dagger/
├── main.go        ← pipeline definition
├── dagger.json
├── project.json   ← `@leyman/dagger-ci`, so `verify` formats, lints and compiles it
└── go.mod
```

`verify` catches a mistake in `main.go` before the next CI run. It has no tests or coverage gate, since unit tests of pipeline wiring would test the Dagger SDK and every CI run exercises it. The code `dagger develop` generates is gitignored: the `dagger-develop` target writes it locally, and `New` overlays the engine's copy on the source in CI, since nothing inside Dagger can reach the engine. Its modules come from `go mod download` in a layer of their own, and `GOPROXY=off` keeps everything after it from reaching the network.

If Dagger fails but `test-ci` passes locally, suspect an environment difference: a file that is gitignored or untracked, a file in a directory `New` excludes from the source (`.claude`, `.devcontainer`, `.github`, `.vscode`), or a version mismatch between the devcontainer and Dagger. Changing that exclude list means updating `ciExcluded` in `docs/.vitepress/config.ts` too.
