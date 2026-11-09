<div style="text-align:center">

# @leyman/check-package

Check an npm package as it would be published, running publint, Are The Types Wrong, a strict typecheck of its declarations, and checks of its Node.js support floor and published files.

[![npm package](https://badge.fury.io/js/@leyman%2Fcheck-package.svg)](https://www.npmjs.com/package/@leyman/check-package)
[![License](https://img.shields.io/npm/l/@leyman/check-package.svg)](https://github.com/JacobLey/leyman/blob/main/apps/check-package/LICENSE)

</div>

A package can build and pass its tests, and still be broken once it is published. An entry point might not exist, its types might be wrong under one of the module resolutions, or a new folder might be missing from `files`.

`check-package` is a CLI that packs the package with your package manager (pnpm or npm) and checks the tarball, so `workspace:` and `catalog:` versions and `files` are what npm will get. On that tarball it runs publint and Are The Types Wrong, which check that the entry points exist, are well formed, and resolve to types under the module resolutions you support (the `strict`, `node16` or `esm-only` profile).

It adds a few checks of its own:

- The published `.d.ts` files are type-checked with `strict` and `skipLibCheck: false`, the way the strictest consumer compiles them. An error that a `@ts-expect-error` hid in the source fails here.
- `engines.node` must name a floor (like `>=22`), the installed `@types/node` must match it, and every runtime dependency must support it.
- Every top-level path that Git doesn't ignore must be either published or on a list of paths that never are, so a new `data/` folder can't be forgotten in `files`.

## Contents

- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [CLI](#cli)
- [API](#api)
- [Compared to alternatives](#compared-to-alternatives)

## Install

```sh
npm i -D @leyman/check-package
```

The declarations check runs your own `tsc`, so `typescript` should be installed too.

## Example

```sh
cd packages/my-package
check-package --profile esm-only
```

```text
attw "." (node16-cjs): ⚠️ A `require` call resolved to an ESM JavaScript file, which is an error in Node and some bundlers. ...
files: "data" is not published. Add it to "files" in package.json, or if it should never be published, to the paths not published (--not-published).
```

It exits with 1 when it finds a problem, so it fails a CI step.

## Usage

Run it from the package's directory, or pass `--cwd`. Build the package first, since it checks what is built.

The workspace root is the nearest directory with a lockfile, from the package up, and the lockfile says which package manager packs the package (`pnpm-lock.yaml` for pnpm, `package-lock.json` or `npm-shrinkwrap.json` for npm). Yarn and Bun aren't supported for packing; pass `--root` and `--pack-with` to use pnpm or npm in such a workspace.

What it checks, in order of what it prints:

| Check               | Fails when                                                                                                                                                                                                                                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Support floor       | `engines.node` is missing or doesn't start with `>=`; the installed `@types/node`'s major version isn't the floor's; a runtime dependency (`dependencies`, peers, optional) isn't installed, or its `engines.node` doesn't allow the oldest version the package's does; with `--floor-tsconfig`, `tsconfig.json` doesn't extend the floor's config. |
| Published files     | A top-level path that `.gitignore` files from the root down don't ignore is neither in the tarball nor on the paths never published, or is on that list and published.                                                                                                                                                                              |
| publint             | publint, in strict mode, reports an error or a warning. Its suggestions are printed and don't fail.                                                                                                                                                                                                                                                 |
| Are The Types Wrong | An entry point has a problem under a resolution of the profile, or the package has no types.                                                                                                                                                                                                                                                        |
| Declarations        | `tsc --strict --skipLibCheck false` reports an error in one of the package's published `.d.ts` files (errors in dependencies' are not the package's to fix), or about the check itself.                                                                                                                                                             |

Paths never published, by default: `.gitignore`, `.npmignore`, `CHANGELOG.md`, `biome.json`, `eslint.config.js`, `project.json`, `src`, `test`, `tsconfig.json` and `types.d.ts`. Add others with `--not-published`.

## CLI

```sh
check-package [options]
```

| Option             | Default                               | Description                                                                                                                                                                                                                                                                                |
| ------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--cwd`            | `.`                                   | The package directory.                                                                                                                                                                                                                                                                     |
| `--root`           | the nearest directory with a lockfile | The workspace root: where `.gitignore` files start to apply, and what a relative `--floor-tsconfig` starts from.                                                                                                                                                                           |
| `--pack-with`      | the root lockfile's                   | `pnpm` or `npm`.                                                                                                                                                                                                                                                                           |
| `--profile`        | `strict`                              | The resolutions every entry point must work under, named as in Are The Types Wrong's CLI: `strict` (`node10`, `node16` CommonJS and ESM, `bundler`), `node16` (without `node10`) or `esm-only` (`node16` ESM and `bundler`).                                                               |
| `--not-published`  | —                                     | A top-level path that is never published, besides the defaults. Repeatable.                                                                                                                                                                                                                |
| `--floor-tsconfig` | —                                     | The config `tsconfig.json` must extend, with `{major}` for the floor: a package specifier, matched as written (`@leyman/configs/tsconfig.node-{major}.json`), or a path relative to the root starting with `./` or `../` (`./configs/tsconfig.node-{major}.json`). Not checked without it. |
| `--tsc`            | the nearest `node_modules/.bin/tsc`   | Path of `tsc`.                                                                                                                                                                                                                                                                             |

## API

### `checkPackage(options?)`

The same check, without printing.

```ts
import { checkPackage } from '@leyman/check-package';

const { problems, suggestions } = await checkPackage({ cwd: 'packages/my-package', profile: 'esm-only' });
```

| Option          | Type                                 | Default                               | Description                                           |
| --------------- | ------------------------------------ | ------------------------------------- | ----------------------------------------------------- |
| `cwd`           | `string \| URL`                      | `process.cwd()`                       | The package directory.                                |
| `root`          | `string \| URL`                      | the nearest directory with a lockfile | As `--root`.                                          |
| `packWith`      | `'npm' \| 'pnpm'`                    | the root lockfile's                   | As `--pack-with`.                                     |
| `profile`       | `'strict' \| 'node16' \| 'esm-only'` | `'strict'`                            | As `--profile`.                                       |
| `notPublished`  | `readonly string[]`                  | `[]`                                  | Paths never published, besides `defaultNotPublished`. |
| `floorTsconfig` | `string`                             | —                                     | As `--floor-tsconfig`.                                |
| `tsc`           | `string \| URL`                      | the nearest installed                 | As `--tsc`.                                           |

**Returns** `Promise<{ problems: readonly string[]; suggestions: readonly string[] }>`: each problem as the CLI prints it, and publint's suggestions.

**Rejects** with a `CheckPackageError` when the check itself can't run: `CheckPackageRootError` when no lockfile is found, the package isn't inside `root`, or the package manager can't be told; `CheckPackageTscError` when the package publishes declarations and no `tsc` is found. Problems with the package are returned in `problems` instead of thrown.

### Also exported

- `defaultNotPublished`: the paths never published by default.
- `profiles`: each profile's resolution kinds, and the `Profile` type.
- `packManagers`: `['npm', 'pnpm']`, and the `PackWith` type.

## Compared to alternatives

- [publint](https://www.npmjs.com/package/publint) and [`@arethetypeswrong/cli`](https://www.npmjs.com/package/@arethetypeswrong/cli): this runs both on one tarball, and adds the declarations typecheck, the support floor and the published files check.
- `npm pack --dry-run`: lists what is published, for a person to read. check-package fails on what shouldn't be there or is missing.
