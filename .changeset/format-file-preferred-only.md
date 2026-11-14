---
"format-file": major
---

Only the most preferred formatter runs, and a failure rejects with the new `FormatFileError` (with `formatter` and `cause`) instead of passing the files to the next formatter. Previously Biome wrote the files it could and exited with an error on one syntax error, and Prettier then reformatted the whole batch in its own style. A file excluded by Biome's `files.includes`, or one Biome doesn't support, made Biome exit with an error too, so Prettier formatted it. Biome now runs with `--no-errors-on-unmatched`, and Prettier likewise skips missing and unsupported files, so they are left unchanged without an error.

To keep formatting best-effort, catch `FormatFileError`. `unsafeFallback: true` restores the old behavior exactly: each formatter in turn, and resolving even if all of them fail.
