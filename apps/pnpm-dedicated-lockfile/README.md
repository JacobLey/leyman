<div style="text-align:center">

# pnpm-dedicated-lockfile
Generate a per-package lockfile extracted from the monorepo `pnpm-lock.yaml`.

[![npm package](https://badge.fury.io/js/pnpm-dedicated-lockfile.svg)](https://www.npmjs.com/package/pnpm-dedicated-lockfile)
[![License](https://img.shields.io/npm/l/pnpm-dedicated-lockfile.svg)](https://github.com/JacobLey/leyman/blob/main/apps/pnpm-dedicated-lockfile/LICENSE)

</div>

For the problem this solves and design rationale, see [WHY-PNPM-DEDICATED-LOCKFILE.md](./WHY-PNPM-DEDICATED-LOCKFILE.md).

## Contents
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [CLI](#cli)
- [Also See](#also-see)

## Install

```sh
npm i pnpm-dedicated-lockfile --save-dev
```

## Example

```sh
# Write .pnpm-lock to ./packages/my-app/
pnpm-dedicated-lockfile --projectDir ./packages/my-app

# Write a SHA hash instead of the full lockfile
pnpm-dedicated-lockfile --projectDir ./packages/my-app --hash

# Check without writing (CI mode)
pnpm-dedicated-lockfile --projectDir ./packages/my-app --ci
```

Output is written to `<projectDir>/.pnpm-lock` by default.

## Usage

Run after `pnpm install`. The generated `.pnpm-lock` file reflects only the direct and transitive dependencies of the target package. Use it as a CI cache key — it only changes when _that package's_ dependency tree changes.

The generated file is **not** a real lockfile and cannot replace `pnpm-lock.yaml`. It is for caching and visual inspection only.

Commit the generated files to version control. They are as deterministic as `pnpm-lock.yaml`, and committing them allows CI to detect drift with `--ci`.

## CLI

```sh
pnpm-dedicated-lockfile [options]
```

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--projectDir` | `string` | `.` | Directory of the package to generate a lockfile for. |
| `--hash` | `boolean` | `false` | Write a SHA hash instead of the full lockfile JSON. Smaller output, but may have more collisions. |
| `--lockfile-name` | `string` | `.pnpm-lock` | Override the output file name. |
| `--omit-comment` | `boolean` | `false` | Exclude the `// DO NOT EDIT` comment at the top of the file. |
| `--omit-links` | `boolean` | `false` | Exclude local workspace link dependencies (`workspace:^` specifiers). Included by default. |
| `--dry-run` | `boolean` | `false` | Compute the lockfile without writing it. |
| `--ci` | `boolean` | auto (CI env) | Fail if the existing file is out of date. Set explicitly to `false` when not tracking files in version control. |

## Also See

- [WHY-PNPM-DEDICATED-LOCKFILE.md](./WHY-PNPM-DEDICATED-LOCKFILE.md) — motivation: why per-package lockfiles help CI caching
- [pnpm workspaces](https://pnpm.io/workspaces) — the monorepo model this tool is designed for
