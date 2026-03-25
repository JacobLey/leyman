# Updating Dependencies

## Overview

This workspace uses a centralized `catalog:` section in `pnpm-workspace.yaml` for all dependency versions. Updating a version there updates it across all packages in the monorepo.

The most common flow is bumping minor/patch dependencies, which *should* be non-breaking and safe to roll out. 
Instructions are described in the first part of this file.

Instructions for bumping major versions are in the second part.

## Steps For non-major updates

### 1. Check for outdated packages

```bash
pnpm outdated -r --format json
```

### 2. Classify updates

- **Apply**: minor and patch bumps only — where the latest major version equals the current major version
- **Skip**: major version bumps (e.g., `5.x → 6.x`, `9.x → 10.x`)
- For `0.x` packages, compare the first digit: `0.7 → 0.8` is still `0.x`, so apply it

### 3. Update `pnpm-workspace.yaml`

Edit the `catalog:` section (and `catalogs:` — that's for local package aliases, and gets out of sync after publishing):

```yaml
catalog:
  some-package: ^<new-latest-version>
```

Only update packages with minor/patch bumps. Leave major-bump packages at their current version.

### 4. Identify affected non-dev packages for changesets

From the JSON output, find packages where:
- `dependencyType !== "devDependencies"` (including regular `dependencies` as well as peer + optional dependencies)
- The update is minor/patch (not major)

Collect all `dependentPackages[].name` values from those entries.

### 5. Create a changeset

Create `.changeset/<unique-name>.md` (adjective-noun-verb format):

```markdown
---
"package-a": minor
"package-b": patch
---

Update dependencies: <list updated packages and new versions>
```

Affected packages get a `minor` bump if the dependency is a "peer" or "optional" dependency.
They get a `patch` if it is present in `"depenencies"`

Ignore projects in the /leyman directory, those are not publicly published and do not need to abide by semver.

### 6. Perform install

```bash
pnpm i
```

Will replace downloaded packages with latest versions across all packages.

### 7. Verify

```bash
pnpm outdated -r
```

Only major-version packages should remain in the outdated list.

### 8. Test

```bash
test-only
```

Assuming tests were stable, and all changes were non-breaking, tests should continue to pass with latest versions.

The build process should also generate a new `.pnpm-lock-hash` for affected packages as well, signaling NX's cache has been successfully updated.

If tests fail, report them to the user so they can iterate on solving. Some may as trivial as small lint/formatting changes, some may require unexpected refactors that should require intentional input.

Then run

```bash
test-and-fix
```

Which will then also perform linting and reformat files.

If the linter has any failures, again report them to the user.

## Steps For major updates

Only update major versions that are explicitly requested. 
This will usually come with breaking changes that will need to be handled safely, and may be intentionally avoided if the breaking changes are
not currently mitigatable.

### 1. Check for outdated packages

```bash
pnpm outdated -r --format json
```

### 2. Find specific version

Find the latest version for the requested package. It should be a major bump from what is in pnpm-workspace.yaml.
If it is just a minor/patch update, proceed with instructions following [Steps For non-major updates](#steps-for-non-major-updates) above.

### 3. Update `pnpm-workspace.yaml`

Edit the `catalog:` section (and `catalogs:` if already listed there):

```yaml
catalog:
  some-package: ^<new-latest-version>
```

### 4. Identify affected non-dev packages for changesets

From the JSON output, find packages where:
- `dependencyType !== "devDependencies"` (including regular `dependencies` as well as peer + optional dependencies)

Collect all `dependentPackages[].name` values from those entries.

### 5. Create a changeset

Create `.changeset/<unique-name>.md` (adjective-noun-verb format):

```markdown
---
"package-a": minor
"package-b": patch
---

Update dependencies: <list updated packages and new versions>
```

Affected packages get a `minor` bump if the dependency is a "peer" or "optional" dependency.
They get a `patch` if it is present in `"depenencies"`

Ignore projects in the /leyman directory, those are not publicly published and do not need to abide by semver.

### 6. Perform install

```bash
pnpm i
```

Will replace downloaded package with latest versions across all packages.

### 7. Verify

```bash
pnpm outdated -r
```

Requested package should no longer show up in the report.

### 8. Test

```bash
test-ci
```

Because of possible breaking changes, this command may break. Report failures, so developer can iterate on possible solutions.