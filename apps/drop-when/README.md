<div style="text-align:center">

# drop-when

Marks each workaround with the upstream fix or date that ends it, and reports which ones can be dropped.

</div>

Code collects workarounds for bugs in its dependencies (a patch on a package, a pinned version, a test written around a crash). Each one is meant to go once the fix is released, often once that release is a few days old, but nothing tells anyone when that happens. Someone has to remember the issue and keep checking it, so most workarounds outlive the bug they work around.

Ideally each workaround names the condition that ends it in a form a tool can read, and the tool says which conditions have come true: the fix is merged, it is in a release, and the release is old enough.

`drop-when` is a CLI that does this for GitHub issues and pull requests, and for dates. A marker is a line next to the workaround, in any text file, while the comment around it still explains the workaround:

```yaml
patchedDependencies:
  # Unmaps from code point ranges instead of a Map of every code point. Drop once a release fixing
  # https://github.com/dubzzz/fast-check/issues/7551 is 7 days old
  # drop-when: released https://github.com/dubzzz/fast-check/pull/7566
  fast-check@4.10.2: patches/fast-check@4.10.2.patch
```

`drop-when check` fails on a malformed marker. It only reads files, so it can run with lint and tests. `drop-when report` follows each marker on GitHub to the fix and the first release that contains it, and prints which workarounds are due.

It only knows GitHub, and only GitHub Releases: a repository that publishes from tags alone can't be followed.

## Contents

- [Usage](#usage)
- [Markers](#markers)
- [Commands](#commands)
  - [check](#drop-when-check-paths)
  - [report](#drop-when-report-paths---min-age-duration)
- [How a marker is resolved](#how-a-marker-is-resolved)
- [Limits](#limits)
- [Compared to alternatives](#compared-to-alternatives)

## Usage

`drop-when` isn't published yet. In this repository, `nx run @leyman/main:drop-when-check` runs `check` as part of `verify`, and `nx run @leyman/main:drop-when-report` prints the report.

Both commands read every file under the working directory that no `.gitignore` ignores, the way Git decides which new files it would add, so they list the same files with or without a Git repository (in CI, say). They read each directory's `.gitignore` on the way down, including nested ones and their negations, and never enter an ignored directory. They always skip `.git`, binary files (those with a NUL byte, as Git decides) and symbolic links. A `.gitignore` above the working directory, `.git/info/exclude` and a global excludes file aren't read, so run them from the repository's root. A tracked file that matches a `.gitignore` rule is skipped too.

They take the files or directories to scan (by default the working directory), and `--exclude` leaves out a file, or everything under a directory. Each path is relative to the working directory, and must exist:

```sh
drop-when check src --exclude src/vendor --exclude src/fixtures.ts
```

## Markers

A marker is the text `drop-when:` followed by a condition. It can be anywhere on a line, so it works in any comment syntax (`#`, `//`, `/* */`, `<!-- -->`), and every occurrence is a marker, even two on one line.

| Condition        | Due                                                                                                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `released <URL>` | Once the fix for a GitHub issue or pull request is in a release that is old enough (`--min-age`). The URL is exactly `https://github.com/<owner>/<repo>/issues/<number>` or `https://github.com/<owner>/<repo>/pull/<number>` |
| `<YYYY-MM-DD>`   | From the start of that day, UTC. The day must exist (`2026-02-30` is malformed)                                                                                                                                               |

Whitespace separates the words of a condition, and anything after the condition is ignored, so a comment closes after a space: `<!-- drop-when: 2026-11-25 -->`. Anything else after the token, including a URL with trailing punctuation, is a malformed marker.

When a pull request fixes an issue, point the marker at the pull request. GitHub records no commit on an issue that a merged pull request closed, so the report can't follow the issue to the fix, and lists it under [Decide by hand](#how-a-marker-is-resolved).

## Commands

The two commands are split by what they depend on. `check` depends only on the files, so the same commit always gives the same result, and it can run in CI or as a cached task. `report` depends on GitHub and on the date, so its result changes without any commit. It belongs in a run by hand or a scheduled job, never in a check that gates a change.

### `drop-when check [paths..]`

Fails on any malformed marker, without going online.

```text
$ drop-when check
pnpm-workspace.yaml:97: "released" needs a GitHub issue or pull request URL (https://github.com/<owner>/<repo>/issues/<number> or /pull/<number>), got "jsx-eslint/eslint-plugin-jsx-a11y#1081"
1 malformed marker
```

It prints each malformed marker as `path:line: problem` on stderr and exits with 1. Otherwise it prints how many markers it found, and exits with 0.

### `drop-when report [paths..] --min-age <duration>`

Resolves each marker against GitHub's REST API, and prints a Markdown report.

| Option          | Description                                                                                                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--min-age`     | Required. How old the release with a fix must be before its marker is due, in whole days or hours (`7d`, `12h`). A day is 24 hours. There is no default, so a run always says what it waits for |
| `--fail-on-due` | Also exit with 1 when a marker is due, for a scheduled job that should fail until the workaround goes                                                                                           |

`GITHUB_TOKEN`, when set, is sent with each request. It only raises GitHub's rate limit (60 requests an hour without it), and never changes a result. Hitting a rate limit is a failed lookup, with when the limit resets: the report never retries, so its result never depends on how long it waited.

```text
$ drop-when report --min-age 7d
# drop-when report

4 markers, at 2026-11-18T04:37Z, with a minimum release age of 7d.

## Due

- `src/client.ts:40` https://github.com/owner/lib/pull/812: released in `v2.3.0` on 2026-11-02T10:15Z

## Decide by hand

- `src/hooks.ts:96` https://github.com/TanStack/query/pull/12257: closed without merging

## Waiting

- `pnpm-workspace.yaml:313` https://github.com/dubzzz/fast-check/pull/7566: fixed by `0f9a865`, in no release yet

## Open

- `src/cli.ts:142` https://github.com/yargs/yargs/issues/1975
```

Sections come in that order, followed by failed lookups, and are left out when empty. Within a section, markers are sorted by path, then line. It exits with 1 when a lookup failed (or with `--fail-on-due`, when a marker is due), and otherwise with 0. A malformed marker fails it as it fails `check`, before any request.

## How a marker is resolved

A pull request is fixed by its merge commit. An issue is fixed by the commit named on the last time it was closed, which GitHub records when a commit closes it (`Fixes #123` in a commit message). The first release containing the fix is the oldest GitHub Release published after the fix (leaving out drafts and prereleases) whose tag the fix is an ancestor of. The marker is due once that release is `--min-age` old.

| Section        | When                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| Due            | The release with the fix is old enough, or the day has come. Drop the workaround                                      |
| Decide by hand | The pull request was closed without merging                                                                           |
| Decide by hand | The issue was closed as not planned, or as a duplicate                                                                |
| Decide by hand | The issue was closed with no commit named, by hand or by merging a pull request. Point the marker at the pull request |
| Decide by hand | The fix is merged, but the repository has no GitHub Releases to say when it ships                                     |
| Waiting        | The fix is merged, but no release contains it yet                                                                     |
| Waiting        | The release with the fix becomes old enough, or the day comes, on the date shown                                      |
| Open           | The issue or pull request is still open                                                                               |
| Failed lookups | A request to GitHub failed, or hit a rate limit                                                                       |

Each URL is requested once per run, so markers that share an issue, or a repository's releases, share the requests.

## Limits

- Only GitHub, and only issues and pull requests. Other forges, and conditions on a package version, aren't supported.
- Only GitHub Releases tell when a fix ships. A fix in a repository that only pushes tags is listed under Decide by hand, and the report doesn't fall back to tags or commit dates.
- A repository that releases several packages (a monorepo) gets the first release of any of them that contains the fix. The report shows the tag, so you can see which package it was.
- Cross-references are never followed. If an issue was closed by a pull request, only a marker on the pull request can be resolved.

## Compared to alternatives

- [`unicorn/expiring-todo-comments`](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/expiring-todo-comments.md) fails lint on a TODO past a date or a package version, in JavaScript comments only. It can't follow an issue to a release.
- [`todo_or_die`](https://github.com/searls/todo_or_die) raises (or warns) in Ruby code at runtime once a date passes or a condition is met.
- [Renovate](https://docs.renovatebot.com/) and Dependabot tell you a new version exists, but not that it fixes the bug a workaround is for.
