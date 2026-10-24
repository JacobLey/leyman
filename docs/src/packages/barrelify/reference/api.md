---
description: The barrelify CLI, its flags, and the barrelify() function.
---

# API

## CLI

```sh
barrelify [options]
barrel [options]
```

`barrel` and `barrelify` are the same command.

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--ci` | `boolean` | `true` in CI, `false` otherwise | Don't write files. Print the barrels that are out of date, and exit with an error if there are any. |
| `--dry-run` | `boolean` | `false` | Don't write files. Print the barrels that would change. |
| `--cwd` | `string` | `.` | Directory to search for index files, recursively. |
| `--ignore` | `string[]` | — | Globs of index files to skip, relative to `--cwd`. |
| `--help` | | | Print usage. |
| `--version` | | | Print the installed version. |

Pass `--no-ci` to write barrels in CI.

```sh
barrelify --ci                       # fail if any barrel is out of date
barrelify --cwd ./src                # only barrels in ./src
barrelify --dry-run                  # list barrels that would change
barrelify --ignore '**/generated/**' # skip generated directories
```

## `barrelify(options?)`

Rewrites every `// AUTO-BARREL` index file, like the CLI.

Barrelify is ESM only. From CommonJS, load it with a dynamic import: `const { barrelify } = await import('barrelify');`.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cwd` | `string \| URL` | `process.cwd()` | Directory to search for index files, recursively. |
| `dryRun` | `boolean` | `false` | Compute every barrel, but don't write any. |
| `ignore` | `readonly string[]` | `[]` | Globs of index files to skip, relative to `cwd`. |

**Returns** `Promise<string[]>`: the absolute paths of the barrels that changed, or would change with `dryRun`.

```ts
import { barrelify } from 'barrelify';

const changed = await barrelify({ cwd: './src', ignore: ['**/generated/**'] });
//    ^?
```

There is no `ci` option. To check barrels from code, use `dryRun` and fail when anything would change:

```ts
import { barrelify } from 'barrelify';

const stale = await barrelify({ dryRun: true });
if (stale.length > 0) {
    throw new Error(`Barrels out of date:\n${stale.join('\n')}`);
}
```
