---
"populate-files": major
"load-populate-files": major
---

`clean` without a `manifest` now throws a `TypeError` (the CLI's `--clean` without `--manifest` fails), instead of removing every file in `targetDir` that the run didn't write. With the default `targetDir` of `.`, that was the whole project, `.git` and `node_modules` included.

To migrate, add a `manifest`: the first run adopts every file that is already up to date, without `force`, and from then on `clean` only removes files it wrote. Or pass `unsafeCleanUnlisted: true` (`--unsafe-clean-unlisted`) to keep the old behaviour on a directory that holds nothing but generated files. `unsafeCleanUnlisted` without `clean`, or with a `manifest`, also throws a `TypeError`.
