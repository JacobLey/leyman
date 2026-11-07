---
name: versioning
description: Versioning packages with changesets
---

# Versioning and Changesets

> Config: [`../../../.changeset/config.json`](../../../.changeset/config.json)

Every change to a published package's behavior, API or runtime dependencies needs a changeset. `changeset` is interactive, so as an agent write the file directly as `.changeset/<adjective-noun-verb>.md`:

```md
---
"package-name": patch
---

Description of the change, written for the package's CHANGELOG.
```

Use the npm package name (from `package.json`), not the directory name. One file can list several packages.

A changeset for a package on the [docs site](../docs-site/SKILL.md#documented-packages) usually means its pages need updating too.

## No changeset needed for

- Private packages (`"private": true`), such as `@leyman/main`
- Changes only to tests, dev tooling, configs, CI or devDependencies

## Releasing

Don't run `changeset version` or publish by hand. After a changeset merges to `main`, CI opens a "Version Packages" PR; merging that PR publishes to npm. See the [dagger-ci skill](../dagger-ci/SKILL.md#releasing). The exception is `changeset version` on a branch [patching an older major](../dagger-ci/SKILL.md#patching-an-older-major).

## Go modules

Changesets only versions npm packages. A released Go module (`apps/genever/go`, `apps/populate-files/go`, `tools/generated-signature/go`) has a `VERSION` file (`X.Y.Z`) and a `CHANGELOG.md`, both edited by hand: to release, bump `VERSION`, add a `## X.Y.Z` section at the top of the changelog, and merge to `main`; CI tags `<directory>/vX.Y.Z` ([dagger-ci](../dagger-ci/SKILL.md#releasing)). A tag can't be changed once the Go proxy has it, so a mistake is fixed with a new version.

A released module requires its workspace dependencies at their `VERSION` (with a `replace` to the workspace copy, which consumers ignore), and `check-go-release` fails otherwise. So when a module needs a dependency's unreleased change, bump the dependency's `VERSION` too, and require the new version. It doesn't need a changeset; a change to the TypeScript package it ports still does.

`go install <module>/cmd/...@<version>` refuses a module whose `go.mod` has `replace` directives, so the genever command is installed with `go get -tool` (which ignores a dependency's `replace`) instead. A root `go.work` doesn't avoid them: Go still fetches each workspace module's required version, which doesn't exist until it is tagged.

A changeset naming a package that is no longer in the workspace makes `changeset version` fail, so delete or edit changesets when removing a package.
