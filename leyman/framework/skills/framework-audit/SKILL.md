---
name: framework-audit
description: Audit a repository against the principles of the leyman framework, for the judgment calls a script can't make (package design, READMEs, comments, tests and versions), after `leyman-framework audit` has run
---

# Framework audit

A brief for a coding agent, run in the repository being audited. Start fresh: everything you need is linked here.

## First

1. Run `pnpm dlx @leyman/framework audit` from the repository root. It decides what a script can, and reports the [tier](https://jacobley.github.io/leyman/framework/adoption) the repository meets. Don't repeat its checks: list its failures in your report as they are.
2. Read the [principles](https://jacobley.github.io/leyman/framework/principles). They are the bar for every finding below, and each finding names the one it misses.

Audit the packages the prompt names, or else every package that isn't `private`. Report; don't change code unless the prompt asks you to.

## What to check

### Package design

A package is simple, deterministic, predictable and, most of all, useful.

- **Useful:** each export earns its place for a caller. A feature that confuses more than it helps is a finding, and so is a natural extension that belongs in a package of its own.
- **Deterministic:** the same input gives the same output. Look for unstable ordering (object keys, `Set`s, file listings), unseeded randomness, and output that depends on the time, the locale or the machine.
- **Predictable:** no hidden state, silent fallbacks or surprising defaults. An error says what went wrong and what to do instead.
- **Dependencies:** each runtime dependency of a published package is justified, with nothing lighter that does the job.
- **Support floor:** `engines.node` is the oldest Node.js the package can support without losing functionality, and no lower than any runtime dependency's.

### README

Install the package from its tarball (`pnpm pack`) in a scratch project and do one realistic task with only its README and type declarations. Every place you had to guess is a finding.

- The first paragraph is the `package.json` `description`.
- Install, with every peer dependency and whether it is optional.
- The example compiles as written.
- Each option's type, default and whether it is required. Each error a caller can see, and when.

### Comments

- A comment states what the code does and why. Surprising behaviour links its justification: a spec, or a permalink to the upstream lines.
- No history ("this used to…"): that belongs in commit messages.
- Every workaround in code says what ends it: `@ts-expect-error`, a skipped test, a version pinned in code, a disabled check.

### Tests

- Tests import the package by its name and test behaviour through its public API.
- Errors and edge values (empty, `null`, 0, the limits) are covered, not only the happy path.
- Coverage comes from assertions on behaviour, not from calls that assert nothing.
- No sleeps, wall-clock time or order between tests.

### Versions

- Pending changesets bump by what changed: a major only for a meaningful change, a bug fix a patch.
- A breaking change offers an `unsafe`-prefixed option that restores the old behaviour, and data written by an earlier version stays readable.

## Report

Per package, most important first: each finding with its file and line, the principle it misses, and the change that fixes it. Then what you checked and found fine. Plain text, nothing else.
