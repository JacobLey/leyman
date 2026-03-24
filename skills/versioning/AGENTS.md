# Versioning and Changesets

> Changesets docs: [github.com/changesets/changesets](https://github.com/changesets/changesets)
> Config: [`../../.changeset/config.json`](../../.changeset/config.json)

## Overview

This repo uses [Changesets](https://github.com/changesets/changesets) to track version bumps and generate changelogs. Every PR that changes a published package should include a changeset file.

## Creating a Changeset

After making your changes, run:

```bash
changeset
```

Follow the interactive prompts to:
1. Select which packages were changed
2. Choose the semver bump type (`patch`, `minor`, `major`)
3. Write a summary of the change

This creates a file in `.changeset/` (e.g. `.changeset/brown-foxes-run.md`). Commit it alongside your code changes.

## Changeset File Format

Generated files look like:

```md
---
"package-name": patch
---

Description of the change.
```

You can edit this file manually if you need to.

## When NOT to Write a Changeset

- Changes only to dev tooling, configs, or CI
- Changes only to test files
- Changes only to `leyman/main` (workspace package, never published)
