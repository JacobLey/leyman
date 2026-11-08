---
"format-file": patch
---

Run Prettier in the calling process instead of starting its CLI for every call. Prettier is imported once, on first use, so after the first call formatting with Prettier no longer pays a Node.js start: a `formatText` call went from about 41 ms to 2.5 ms, and a 10-file `formatFiles` from about 66 ms to 10 ms (the first call of a process, which imports Prettier, from 46 ms to 33 ms and 70 ms to 45 ms). Results are the same as the CLI's: `.prettierignore`, `.editorconfig` and plugins named in the config still apply, and a file Prettier can't format is still left to the next formatter.
