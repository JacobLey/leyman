---
name: writing-readmes
description: Writing and maintaining package READMEs
---

# Writing Package READMEs

> Examples from leyman: [`../../../tools/lease-cache/README.md`](../../../tools/lease-cache/README.md) · [`../../../tools/idempotency-keys/ts/README.md`](../../../tools/idempotency-keys/ts/README.md)

## Purpose

Every package needs a README. It is published to npm, so it is written for people using the package, and it doubles as the precise API reference agents read. Repo-internal conventions belong in SKILL.md files, not READMEs.

The README is also how the package is found and judged. npm search, web search, LLM crawlers and coding agents read the npm page (often only its first screen) and `node_modules/<pkg>/README.md`. Few follow links to other files. So the first screen of the README must say what the package does, what sets it apart, and when not to use it. It leads with the package's own merits: a comparison with alternatives belongs near the end (see below), not in the opening.

## README vs WHY File

**README.md** — How to use the package, opened by a short introduction: the problem or concept, the package as the solution, what sets it apart, when not to use it, and a link to the WHY file (see [Prose](#prose) for how to write it). The introduction is at most ~25 lines; everything after it guides an active user. When alternatives exist, a short **Compared to alternatives** section near the end (before **Also See**) names them in a table or list.

**WHY-\<PACKAGE\>.md** — The long form: the problem it solves with worked examples, design decisions, non-goals, and the full comparison to alternatives. Especially useful for more complicated packages. Link it from the end of the README's pitch.

**Rule:** The README introduces the problem and says *that* the package is different, in a few short paragraphs. The WHY file says *why* at length: worked examples, design decisions and the full comparison belong in WHY-\<PACKAGE\>.md.

See leyman's [`tools/haywire/WHY-HAYWIRE.md`](../../../tools/haywire/WHY-HAYWIRE.md) as the reference example.

## Spelling

American spelling ("behavior"), like most published text and the npm ecosystem's docs.

## Standard README Structure

```markdown
<div style="text-align:center">

# Package Name
One-sentence description of what it does (same as `package.json` `description`).

[![npm package](https://badge.fury.io/js/<npm-name>.svg)](https://www.npmjs.com/package/<npm-name>)
[![License](https://img.shields.io/npm/l/<npm-name>.svg)](https://github.com/<owner>/<repo>/blob/main/<path>/LICENSE)

</div>

A paragraph introducing the problem or concept, for a reader who hasn't met it.

`<package>` is a library that ... (what it does about the problem, in a few sentences).

Plain-sentence bullets for the details that set it apart, if there is a real list.

When not to use it, in a sentence or two.

For the full motivation and comparison, see [WHY-<PACKAGE>.md](https://github.com/<owner>/<repo>/blob/main/<path>/WHY-<PACKAGE>.md).

## Contents
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
- [Compared to alternatives](#compared-to-alternatives)   ← only if alternatives exist
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

## Compared to alternatives

| | <package> | <alternative> | <alternative> |
|---|---|---|---|
| <deciding feature> | ✅ | ❌ | ✅ |

Or a short list, one line per alternative. Link the WHY file for the full comparison.

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
- Any other repo file (WHY file, LICENSE, config) → `https://github.com/<owner>/<repo>/blob/main/<repo path>` (for leyman, `https://github.com/JacobLey/leyman/blob/main/<repo path>`)
- A package on the [docs site](../docs-site/SKILL.md#documented-packages) links its overview page near the top: `Guides and the full reference are on the [docs site](<docs site>/packages/<slug>/).` (for leyman, `https://jacobley.github.io/leyman/packages/<slug>/`) Its `package.json` `homepage` is that page too (npm's "Homepage" link is for a project site; npm already shows the README). Others keep `homepage` on the GitHub README. The docs build fails when either is missing.
- In-page anchors (`#...`) are fine, but must match GitHub's slug of the full heading text: `` ### `suite(title, fn)` `` is `#suitetitle-fn`, not `#suite`. Repeated headings get `-1`, `-2` suffixes.

The same applies to WHY files, which link back to the README via its npm page.

## Prose

READMEs, WHY files and docs site pages must read as if the maintainer wrote them for a colleague, not as AI-written. Code comments follow the same rules, with less weight. Reference voice: the original [juniper README](https://github.com/JacobLey/leyman/blob/b783c7ac/apps/juniper/README.md#introduction) and the introductions of the two example READMEs above.

### The introduction

Build the concept up, then present the package as what delivers it. The lease-cache README opens:

> A read-through cache computes an "expensive" value (most likely a database query) and stores it in a cache (either memory or something like Valkey) for future reads.
>
> Ideally the cache also makes sure two parallel reads don't run competing queries. Instead, one (or many) requests can simply wait on the single process that does the actual work, and they all share its result.

1. Define the problem or concept plainly, with parenthetical examples, or a concrete scenario ("When a client sends a `POST` and the connection drops before the response arrives...").
2. Describe the ideal behavior, then name the package as the subject: "`lease-cache` is a read-through cache on Valkey (or Redis) that...", "`idempotency-keys` is a library to handle these requests on the server...".
3. Explain the value in full sentences. Bullets are fine for a real list (the tricky cases it handles), each a plain sentence, not a bold slogan followed by a colon and a packed clause.
4. Say what it doesn't do, or when not to use it.

The introduction doesn't try to be complete: exact headers, every edge case and status codes go in Usage or API. The one-line description under the title (and in `package.json`) is held to the same bar: a plain sentence, not a colon followed by a list of guarantees.

### Voice

- Explain, don't perform. No staged narration ("The first is the stampede. The second is quieter."), flourishes ("Nobody did anything wrong, yet..."), rhetorical openers ("X is easy to describe.") or short punchy sentences for rhythm.
- Full sentences with articles. "The table name is quoted as given", not "Quoted as given." (Terse is fine in API tables and parameter descriptions.)
- The reader, the package or the code as subjects: "you pass", "Juniper solves this by". Don't personify ("`handle()` answers itself", "a crashed request holds up no one").
- Plain, common words a reader never stops to decode ("Valkey is lax", "runs unprotected", "one caller's keys never touch another's"). Use the plain verb: a client *sends* a server rather than *naming* it; avoid *lands*, *surfaces*, *earns its place*, *load-bearing*, *seam*, *story*.
- Give the reason with "so", "because" or "since" in the same sentence, rather than a colon then a fragment.

### Tells to remove

- Colon chains as the default sentence shape: "X: a does b, c does d, and e."
- Bold-label bullets: "- **Thing in bold**: dense explanation; another clause (aside)."
- "X, never Y" and "not X, but Y" contrasts for emphasis; rule-of-three lists; a short moral at the end of a paragraph.
- Stock transitions: "A few more things it handles:", "It also covers the cases that are easy to get wrong:" (once is fine; not in every README).
- Slogan headings ("Two tools, split by who runs them"). Headings say what the section covers.
- Catchphrases and set-ups: "by construction", "bounded by design", "X is a target:", "That is the whole trick:".
- Every caveat packed into the first sentence that mentions a feature.
- The same feature list repeated near-verbatim across the README, the docs site and sibling packages.

### Checking a rewrite

A blind read catches what the writer misses: give another agent (Sonnet is enough) only the text, ask it to quote every sentence that reads as AI-written and why, then fix the quotes that match a tell above. Asked to find tells, it always finds some: on a good draft most of its quotes are plain factual sentences, and it flags the maintainer's own wording ("a few issues pop up", "Except that is the wrong keyword") as readily as real tells. Leave those. Keep every fact when rewriting; move detail lower rather than dropping it.

## What NOT to Put in a README

- Extended motivation or "the problem this solves" → WHY file (the pitch keeps a few bullets)
- Detailed comparison to alternative libraries → WHY file (the README keeps a short table or list near the end)
- Implementation details (how it works internally) → code comments
- Changelog → CHANGELOG.md (managed by changesets)
- Contributing instructions → root README

## package.json Discoverability

`description` is the line npm search, Google snippets and agent search results show. Name the category and the differentiator, not just the category: "Dependency injection for TypeScript that checks the wiring at compile time, without decorators", not "Type safe dependency injection". Package names that don't say what they do (juniper, haywire) rely on it entirely.

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

If the package is on the [docs site](../docs-site/SKILL.md#documented-packages), update its pages in the same change too.
