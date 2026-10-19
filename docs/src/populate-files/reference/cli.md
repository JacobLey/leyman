---
description: The load-populate-files CLI and its flags.
---

# CLI

```sh
load-populate-files --file-path <module> [options]
```

Installed by [`load-populate-files`](/populate-files/guides/config-modules). Loads the files from a config module, and writes them with [`populateFiles`](/populate-files/reference/api#populatefiles-params-options).

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--file-path` | `string` | — | Required. The config module, relative to `--cwd`. |
| `--cwd` | `string` | `.` | Directory that every other path is resolved from. |
| `--target-dir`, `-t` | `string` | `.` | Directory that the config's `filePath`s are resolved from, relative to `--cwd`. |
| `--ci`, `--check` | `boolean` | `true` in CI, `false` otherwise | Don't write. Fail if any file would be created, changed or removed. |
| `--dry-run` | `boolean` | `false` | Don't write files. |
| `--clean` | `boolean` | `false` | Remove files that are no longer generated. In `--ci` mode, fail instead. See [Clean](/populate-files/guides/manifest#clean). |
| `--force` | `boolean` | `false` | Overwrite or remove files despite an [ownership error](/populate-files/reference/api#errors). |
| `--manifest` | `string` | — | Path of a [manifest](/populate-files/guides/manifest) recording the generated files, relative to `--cwd`. |
| `--help` | | | Print usage. |
| `--version` | | | Print the installed version. |

Pass `--no-ci` to write files in CI.

```sh
load-populate-files --file-path ./dist/file-content.js -t ./out                # write, or check in CI
load-populate-files --file-path ./dist/file-content.js -t ./out --ci           # fail if out of date
load-populate-files --file-path ./dist/file-content.js -t ./out \
    --manifest ./out/.generated.json --clean                                   # remove stale files
load-populate-files --file-path ./dist/file-content.js -t ./out --force        # discard hand edits
```

The command exits with an error, and prints it, if anything fails.
