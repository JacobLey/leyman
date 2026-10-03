---
name: updating-dependencies
description: Updating catalog dependencies to latest minor/patch versions
---

# Updating Dependencies

All external versions live in the default `catalog:` in `pnpm-workspace.yaml`. Changing a version there changes it for every package.

By default only apply **minor/patch** updates. Only bump a **major** version when the user asked for that specific package, since it may be held back on purpose.

## Steps

1. **Find updates:** `pnpm outdated -r --format json`.
2. **Classify:** an update is minor/patch when the latest major equals the current major. For `0.x`, `0.7 → 0.8` counts as minor.
3. **Edit `catalog:`** in `pnpm-workspace.yaml` to `^<new-version>`. Leave the named `catalogs:` alone unless the package is already listed there.
4. **Changeset:** for each updated entry whose `dependencyType` is not `devDependencies`, collect its `dependentPackages[].name`, skipping packages under `leyman/`. Write one changeset (see [versioning](../versioning/SKILL.md)) with:
   - `minor` for packages where it is a `peerDependency` or `optionalDependency`
   - `patch` where it is a regular `dependency`

   Summary: `Update dependencies: <package@version, ...>`.
5. **Install:** `pnpm i`, then `pnpm outdated -r`. Only skipped majors (or nothing, for a requested major) should remain.
6. **Test:** `test-only`, then `test-and-fix` (adds lint + auto-fix). For a major bump, finish with `test-ci`.

Report any test or lint failures to the user instead of working around them. Small fixes are fine to propose, but anything needing a refactor is the user's call.
