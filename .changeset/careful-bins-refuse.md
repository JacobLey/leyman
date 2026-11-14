---
"@leyman/nx-plugin": patch
---

The bins print their usage with `--help` and exit with code 2 on an argument they don't take, instead of ignoring it: `leyman-biome-format --help` used to format every file under the current directory.
