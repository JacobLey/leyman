---
name: commit-messages
description: Writing commit messages (subject, body, what goes where)
---

# Commit Messages

A commit message has a short subject and a body that carries the reasoning. `git log --oneline`, GitHub's commit list and blame tooling show only the subject, so a long one is cut off there, while the body has room for all of the why.

## Subject

- **At most 72 characters, aiming for 50 to 65.** Longer ones get truncated by the tools above.
- **Imperative mood, capitalized, no trailing period.** It reads as what the commit does: "Cap the local Nx cache at 5 GB".
- **Names the change, not the reason.** If it needs "since", "so" or "which", that clause is the first sentence of the body.
- **A scope prefix only when it helps.** Use the package name when the subject would otherwise be ambiguous: "genever: report a merge key of anything but maps as a YAMLError". No conventional-commit types such as `feat:`, because changesets already carry the semver meaning.

## Body

A blank line after the subject, then text wrapped at 72 characters, which keeps it readable in a terminal.

The body says why, what the alternative was, and anything a reader of the diff couldn't work out:

- Measurements, such as a timing before and after.
- What was tried and dropped, so nobody tries it again.
- The upstream issue it tracks, as `owner/repo#123`, or a full URL if it isn't on GitHub.

Skip the body when the subject says it all, as a typo fix does.

## Several things in one commit

Prefer splitting the commit. When the parts really do belong together, the subject names the main one and the body gives the rest a paragraph each. Joining them with "and" in the subject is how subjects get long.

## Changesets are for a different reader

A changeset is for the package's users and lands in its `CHANGELOG.md`. The body is for maintainers. Don't paste one into the other: the body may say "see the changeset" for the user-facing summary. See the [versioning skill](../versioning/SKILL.md).

## Also

- A breaking change gets its own commit, with the reason in the body, so it can be reviewed and reverted alone.
- No `Co-Authored-By` or other attribution trailers, on commits or pull requests.

## Examples

This one line holds a subject, a body and a motivation:

> Cap the local Nx cache at 5 GB by deleting the results read longest ago, recording each read in the file's access time so a result's age still counts from when it was stored, since age alone let it reach 10 GB after a busy week

Split up:

```text
Cap the local Nx cache at 5 GB

Age alone let it reach 10 GB after a busy week. Delete the results read
longest ago, recording each read in the file's access time so a
result's age still counts from when it was stored.
```

This one joins an unrelated note onto the change:

> Leave test/, CHANGELOG.md and eslint.config.js out of what check-package hashes, since their contents can't change its result, so editing a test no longer repacks the package, and note in the skills how --excludeTaskDependencies fills the cache and how Nx finds plugins

Split into two commits:

```text
Leave tests and changelogs out of check-package's hash

The contents of test/, CHANGELOG.md and eslint.config.js can't change
its result, so editing a test no longer repacks the package.
```

```text
Note how --excludeTaskDependencies fills the cache

Also how Nx finds plugins.
```

## When not to

Old commits stay as they are: rewriting published history to fix a message isn't worth it. A commit that only exists on your branch can be reworded freely.
