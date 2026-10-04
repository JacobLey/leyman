---
name: writing-readmes
description: Writing and maintaining package READMEs
---

# Writing Package READMEs

> Examples: [`../../../tools/haywire/README.md`](../../../tools/haywire/README.md) · [`../../../apps/juniper/README.md`](../../../apps/juniper/README.md)

## Purpose

Every package needs a README. It is published to npm, so it is written for people using the package, and it doubles as the precise API reference agents read. Repo-internal conventions belong in SKILL.md files, not READMEs.

The README is also how the package is found and judged. npm search, web search, LLM crawlers and coding agents read the npm page (often only its first screen) and `node_modules/<pkg>/README.md`. Few follow links to other files. So the first screen of the README must say what the package does, why to pick it over the alternatives, and when not to.

## README vs WHY File

**README.md** — How to use the package, opened by a short pitch: a few **Highlights** bullets naming what sets it apart, and (when alternatives exist) a short **Compared to** table or list naming them. The pitch is a summary, at most ~25 lines; everything after it guides an active user.

**WHY-\<PACKAGE\>.md** — The long form: the problem it solves with worked examples, design decisions, non-goals, and the full comparison to alternatives. Especially useful for more complicated packages. Link it from the end of the README's pitch.

**Rule:** The README says *that* the package is different and from what, in a few lines. The WHY file says *why* at length. Anything longer than a bullet or table row belongs in WHY-\<PACKAGE\>.md.

See [`../../../tools/haywire/WHY-HAYWIRE.md`](../../../tools/haywire/WHY-HAYWIRE.md) as the reference example.

## Standard README Structure

```markdown
<div style="text-align:center">

# Package Name
One-sentence description of what it does (same as `package.json` `description`).

[![npm package](https://badge.fury.io/js/<npm-name>.svg)](https://www.npmjs.com/package/<npm-name>)
[![License](https://img.shields.io/npm/l/<npm-name>.svg)](https://github.com/JacobLey/leyman/blob/main/<path>/LICENSE)

</div>

- **Highlight** — what sets it apart, in a line.
- **Highlight** — 3–5 of these.

| | <package> | <alternative> | <alternative> |
|---|---|---|---|
| <deciding feature> | ✅ | ❌ | ✅ |

For the full motivation and comparison, see [WHY-<PACKAGE>.md](https://github.com/JacobLey/leyman/blob/main/<path>/WHY-<PACKAGE>.md).

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

## Links

The README is rendered on npmjs.com, which does not resolve relative links inside a monorepo package (`./WHY-PACKAGE.md` 404s there). Every link must be absolute:

- Another package's README → its npm page: `https://www.npmjs.com/package/<name>`
- Any other repo file (WHY file, LICENSE, config) → `https://github.com/JacobLey/leyman/blob/main/<repo path>`
- In-page anchors (`#...`) are fine, but must match GitHub's slug of the full heading text: `` ### `suite(title, fn)` `` is `#suitetitle-fn`, not `#suite`. Repeated headings get `-1`, `-2` suffixes.

The same applies to WHY files, which link back to the README via its npm page.

## What NOT to Put in a README

- Extended motivation or "the problem this solves" → WHY file (the pitch keeps a few bullets)
- Detailed comparison to alternative libraries → WHY file (the pitch keeps a short table)
- Implementation details (how it works internally) → code comments
- Changelog → CHANGELOG.md (managed by changesets)
- Contributing instructions → root README

## package.json Discoverability

`description` is the line npm search, Google snippets and agent search results show. Name the category and the differentiator, not just the category: "Compile-time checked dependency injection for TypeScript — no decorators", not "Type safe dependency injection". Package names that don't say what they do (juniper, haywire) rely on it entirely.

`keywords` should cover the terms someone would search for: the category (`dependency-injection`, `di`, `ioc`), the ecosystem (`typescript`, `nx-plugin`, `tanstack-query`) and the distinguishing feature (`no-decorators`, `compile-time`). Don't add competitor names.

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
