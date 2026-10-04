---
name: versioning
description: Versioning packages with changesets
---

# Versioning and Changesets

> Config: [`../../../.changeset/config.json`](../../../.changeset/config.json)

Every change to a published package's behaviour, API or runtime dependencies needs a changeset. `changeset` is interactive, so as an agent write the file directly as `.changeset/<adjective-noun-verb>.md`:

```md
---
"package-name": patch
---

Description of the change, written for the package's CHANGELOG.
```

Use the npm package name (from `package.json`), not the directory name. One file can list several packages.

## No changeset needed for

- Packages under `leyman/` (private, never published)
- Changes only to tests, dev tooling, configs, CI or devDependencies

## Releasing

Don't run `changeset version` or publish by hand. After a changeset merges to `main`, CI opens a "Version Packages" PR; merging that PR publishes to npm. See the [dagger-ci skill](../dagger-ci/SKILL.md#releasing).

A changeset naming a package that is no longer in the workspace makes `changeset version` fail, so delete or edit changesets when removing a package.
