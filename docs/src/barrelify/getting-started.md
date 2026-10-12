---
description: Install barrelify, opt an index file in, and check barrels in CI.
---

# Getting started

## Install

::: code-group

```sh [npm]
npm i -D barrelify
```

```sh [pnpm]
pnpm add -D barrelify
```

```sh [yarn]
yarn add -D barrelify
```

:::

::: tip
Barrelify requires Node.js 24 or later. It installs two equivalent commands, `barrelify` and `barrel`.
:::

## Opt in an index file

Barrelify never creates files. Create the barrel yourself, starting with `// AUTO-BARREL` as its very first characters:

```ts
// src/components/index.ts
// AUTO-BARREL
```

Any `index.ts`, `index.tsx`, `index.cts` or `index.mts` can be a barrel. Index files without the marker are left alone, so hand-written barrels can sit next to generated ones.

## Generate barrels

```sh
npx barrelify
```

Barrelify searches the current directory and everything below it for marked index files, and rewrites each one to re-export its sibling files, sorted by name:

```
src/components/
├── Button.tsx
├── button.styles.ts
├── types.d.ts
├── index.ts
└── icons/
    └── ...
```

```ts
// @noErrors
// AUTO-BARREL

export * from './Button.js';
export * from './button.styles.js';
```

- Only `.ts`, `.tsx`, `.cts` and `.mts` files are exported. Declaration files (`.d.ts`) are skipped.
- Subdirectories are not exported. Give `icons/` its own barrel, and export it by hand from a non-barrel file if you need it.
- Files ignored by `.gitignore`, and everything in `node_modules`, are skipped.
- Which extensions are exported depends on the package's module system. See [Module systems](/barrelify/guides/module-systems).

The marker is kept, so the next run rewrites the file again. Anything else you write in a barrel is replaced, except for [type-only exports](#type-only-exports).

Commit the barrels, like any other source file.

## Type-only exports

To re-export only the types of a file, change its line to `export type *`:

```ts
// @noErrors
// AUTO-BARREL

export * from './Button.js';
export type * from './button.styles.js';
```

Barrelify keeps the line type-only when it rewrites the file.

## Check barrels in CI

```sh
npx barrelify --ci
```

`--ci` computes every barrel without writing, prints the barrels that would change, and exits with an error if any would. It is on by default when barrelify detects CI (with [ci-info](https://www.npmjs.com/package/ci-info)), so a plain `barrelify` in a CI script checks rather than writes.

Run barrelify before compiling, so the compiler sees up-to-date barrels. In an Nx workspace, a cached target per project does that, and checks instead of writing in CI:

```json
// nx.json
{
    "targetDefaults": {
        "barrelify": {
            "executor": "nx:run-commands",
            "options": {
                "command": "barrelify",
                "cwd": "{projectRoot}"
            },
            "cache": true,
            "inputs": ["{projectRoot}/src/**/*", "{projectRoot}/package.json"]
        }
    }
}
```

## Next steps

- [Module systems](/barrelify/guides/module-systems): which files an ESM or CommonJS barrel exports, and with which extension.
- [API and CLI reference](/barrelify/reference/api): every option, and running barrelify from code.
