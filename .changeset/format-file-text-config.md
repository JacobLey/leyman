---
"format-file": patch
---

`formatText` formats through stdin, as if the text were a file in the current working directory, so the project's Prettier configuration applies. It used to format a temporary file in the OS temp directory, where Prettier found no configuration and used its defaults. `tmp-promise` is no longer a dependency.
