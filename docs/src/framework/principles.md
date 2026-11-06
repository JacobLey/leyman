---
description: "The principles behind this repository's setup, and why: the bar for a package, what each version level means, support floors, dependency weight, lint, generated content, workarounds, and how work is committed and verified."
---

# Principles

The repository's skills say how things are done. This page says why, so a judgment call that no skill covers still lands in the same place. When a design or review question has no rule, decide it by these. Code-level conventions (types, DI, tests, errors) are in the [coding-patterns skill](https://github.com/JacobLey/leyman/blob/main/.claude/skills/coding-patterns/SKILL.md).

## The bar for a package

A package is **simple, deterministic, predictable and, most of all, useful**.

- **Useful** comes first: judge a change by whether it makes the package more useful to the person calling it.
- **Simple**: no more surface than the use warrants. Cut a confusing feature rather than keep it, and split a natural extension into its own package rather than grow this one.
- **Deterministic**: same input, same output. Stable ordering, no unseeded randomness, no output that depends on when or where it runs.
- **Predictable**: no hidden state, silent fallbacks or surprising defaults. When something can't work, fail loudly and say what to do instead.

Audits and reviews flag anything that misses one of these.

## Versions mean something

- A **major** is for a meaningful change. A bug fix is a patch, a minor at most, even when correcting a wrong type breaks someone's compile.
- Ship the non-breaking part first. Put breaking changes in their own commits, so they go out together in one major.
- Every breaking change offers an explicit, `unsafe`-prefixed option that restores the old behaviour, so migrating means setting one option, not rewriting code.
- Data written by an earlier version stays readable.
- A change limited to something not yet released isn't breaking. Before calling something breaking, check what has actually shipped.

How changes are recorded: the [versioning skill](https://github.com/JacobLey/leyman/blob/main/.claude/skills/versioning/SKILL.md).

## Newest toolchain, lowest floor

Development and CI run the newest runtimes and tools. Each published package supports the oldest runtime it can **without losing functionality**: never swap a newer API for a weaker stand-in to reach a lower floor. A package's floor is never below any of its runtime dependencies' floors. Upgrading the toolchain doesn't raise a package's floor. Only that package needing something newer does.

How floors are declared and checked: [Support floors](https://github.com/JacobLey/leyman/blob/main/.claude/skills/typescript/SKILL.md#support-floors).

## Lean where it ships, free where it doesn't

Every runtime dependency of a published package costs its users something: justify each one and look for something lighter first. Dependencies that only affect local work (tests, tooling, the docs site) are fine. Install the real library rather than fake or suppress its types in an example.

## More lint rules, from reputable sources

Rules push code onto one well-aligned path and end debates over style. So:

- When a lint plugin upgrade brings new rules, keep them on and fix the code. Turn one off only if it would need a large rewrite, or contradicts a rule already on, and say which.
- Every disable gives its reason (`-- reason`) at the narrowest scope that works: the line, then the file, then config. A disable whose reason has gone away is removed.
- Fix the code in its own commits first, each passing both the old and the new rules. The version bump goes in a separate commit with only the version, lockfile and config.

How to run and fix: the [linting-formatting skill](https://github.com/JacobLey/leyman/blob/main/.claude/skills/linting-formatting/SKILL.md).

## Generate what can be derived

A list or table that comes entirely from data (package tables, path lists, indexes) is generated and checked in CI, not maintained by hand. Where a person needs to add context to such a file, give it a manual section inside the generated file. Write a file by hand only when every part of it is a judgment.

## Comments state the contract

A comment says what the code does and why. Where behaviour is surprising, link the justification: a spec, or the exact upstream source lines as a permalink. History ("this used to…", "upstream did…") goes in the commit message, not the code.

## Every workaround says when it ends

A patch, dependency override, pinned version or disabled check carries a note naming what removes it: an upstream release, an issue, or a date. A workaround with no exit stays forever. Remove it when that condition is met.

## Commit as you go, verify by how hard it is to undo

- Split multi-part work into steps and commit each one once it works. A local commit that hasn't reached a shared branch costs nothing to rework.
- Run the narrowest check while iterating (one spec, lint on the changed files). Run full verification often, and always before anything that is hard to undo: a merge, a push, a release, or work that builds on top of what you just did.

How to verify: the [nx-run-tasks skill](https://github.com/JacobLey/leyman/blob/main/.claude/skills/nx-run-tasks/SKILL.md). How to write the commit: the [commit-messages skill](https://github.com/JacobLey/leyman/blob/main/.claude/skills/commit-messages/SKILL.md).
