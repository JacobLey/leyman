---
"format-file": minor
---

Format files that `.gitignore` lists. Biome now runs with `--vcs-enabled=false` and Prettier with `--ignore-path=.prettierignore`, so a generated file in an ignored folder is no longer left unformatted, and Biome 2.5.15 and later no longer crash on files outside the project. Biome's `files.includes` and `.prettierignore` still apply.
