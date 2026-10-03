---
name: writing-readmes
description: Writing and maintaining package READMEs
---

# Writing Package READMEs

> Examples: [`../../../tools/haywire/README.md`](../../../tools/haywire/README.md) · [`../../../apps/juniper/README.md`](../../../apps/juniper/README.md)

## Purpose

Every package needs a README. It is published to npm, so it is written for people using the package, and it doubles as the precise API reference agents read. Repo-internal conventions belong in SKILL.md files, not READMEs.

## README vs WHY File

**README.md** — How to use the package. Should not justify the package's existence or compare it to alternatives. Focus on guiding an active user.

**WHY-\<PACKAGE\>.md** — Why this package exists, the problem it solves, motivation, design decisions, comparison to alternatives. Especially useful for more complicated packages that may have existing alternatives. Link from README when relevant.

**Rule:** If a section answers "why does this exist?" rather than "how do I use it?", it belongs in WHY-\<PACKAGE\>.md.

See [`../../../tools/haywire/WHY-HAYWIRE.md`](../../../tools/haywire/WHY-HAYWIRE.md) as the reference example.

## Standard README Structure

```markdown
<div style="text-align:center">

# Package Name
One-sentence description of what it does.

[![npm package](https://badge.fury.io/js/<npm-name>.svg)](https://www.npmjs.com/package/<npm-name>)
[![License](https://img.shields.io/npm/l/<npm-name>.svg)](https://github.com/JacobLey/leyman/blob/main/<path>/LICENSE)

</div>

## Contents
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
- [Also See](#also-see)   ← only if cross-references exist

## Install

\`\`\`sh
npm i <package-name>
\`\`\`

## Example

\`\`\`ts
// Minimal, runnable, copy-pasteable example
\`\`\`

## Usage

Brief description of module system (ESM/CJS), import patterns, and any constraints.

## API

### `functionName(param1, param2?, options?)`

Brief description of what it does.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `param1` | `string` | — | Required. What it does. |
| `param2` | `number` | `0` | Optional. What it does. |
| `options` | `Options` | `{}` | Optional. |

**Returns** `ReturnType` — description of what is returned.

**Throws** `ErrorType` — when it throws (if applicable).

\`\`\`ts
// Example
const result = functionName('hello', 42);
\`\`\`

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `check` | `boolean` | `false` | If `true`, validates without writing. |

---

### `ClassName`

Description of the class.

#### `new ClassName(options)`

Constructor parameters.

#### `.methodName(param): ReturnType`

Method description.

## Also See

- [`other-package`](https://example.com/link-to-other-package) — brief description of relationship
```

## API Documentation Rules

### Function signatures in headers
Use the actual TypeScript signature but simplified for readability:
```markdown
### `findImport(fileNames, options?)`         ← use this
### `findImport(fileNames: string[], options?: FindImportOptions): Promise<unknown>` ← too verbose for header
```

### Parameter tables
Use one for functions with 2+ parameters or any options object. Required parameters show `—` as the default. One-sentence descriptions.

### Type documentation
Export types used by the API should be documented inline where first used, or in a dedicated `## Types` section for complex types.

## What NOT to Put in a README

- Extended motivation or "the problem this solves" → WHY file
- Comparison to alternative libraries → WHY file
- Implementation details (how it works internally) → code comments
- Changelog → CHANGELOG.md (managed by changesets)
- Contributing instructions → root README

## When to Create a WHY File

Create `WHY-<PACKAGE>.md` when:
- The README has >15% motivation/justification content
- The design decisions are non-obvious and users will wonder "why not X?"
- The package solves a problem that has competing solutions

Do NOT create a WHY file for:
- Simple utility packages (enum-to-array, parse-cwd, punycode-esm)
- Packages whose purpose is self-evident from name + description

## Updating READMEs

When the API changes, update the signature header, parameter table and examples in the same change. When restructuring an existing README, move motivation content into the WHY file first.
