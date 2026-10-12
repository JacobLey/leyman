---
description: Which sibling files a barrel re-exports, and with which extension, in ESM and CommonJS packages.
---

# Module systems

A barrel can only re-export files it is able to load. Barrelify works out which those are from the barrel's own extension, and the `"type"` of the nearest `package.json`, the same way Node and TypeScript's `nodenext` resolution do.

## Extensions

Every export uses the extension TypeScript compiles the file to:

| Source file | Exported as |
|-------------|-------------|
| `foo.ts` | `./foo.js` |
| `Foo.tsx` | `./Foo.js` |
| `foo.cts` | `./foo.cjs` |
| `foo.mts` | `./foo.mjs` |

`.tsx` compiles to `.js`, as with TypeScript's `react-jsx` output. If `foo.ts` and `foo.tsx` both exist, `./foo.js` is exported once.

## Which files are exported

A `.ts` or `.tsx` file is ESM when the nearest `package.json` sets `"type": "module"`, and CommonJS otherwise. `.mts` is always ESM, and `.cts` always CommonJS. ESM can import CommonJS, but CommonJS can't `require` ESM, so:

| Barrel | `"type": "module"` | `"type": "commonjs"` or unset |
|--------|--------------------|-------------------------------|
| `index.ts`, `index.tsx` | `.ts`, `.tsx`, `.cts`, `.mts` | `.ts`, `.tsx`, `.cts` |
| `index.mts` | `.ts`, `.tsx`, `.cts`, `.mts` | `.ts`, `.tsx`, `.cts`, `.mts` |
| `index.cts` | `.cts` | `.ts`, `.tsx`, `.cts` |

For example, the same files in two packages:

```
├─┬ esm
│ ├── package.json // { "type": "module" }
│ ├── commonjs.cts
│ ├── esm.ts
│ ├── module.mts
│ └── index.ts     // AUTO-BARREL
└─┬ cjs
  ├── package.json // { "type": "commonjs" }
  ├── cjs.ts
  ├── commonjs.cts
  ├── module.mts
  └── index.ts     // AUTO-BARREL
```

::: code-group

```ts [esm/index.ts]
// @noErrors
// AUTO-BARREL

export * from './commonjs.cjs';
export * from './esm.js';
export * from './module.mjs';
```

```ts [cjs/index.ts]
// @noErrors
// AUTO-BARREL

export * from './cjs.js';
export * from './commonjs.cjs';
```

:::

`cjs/index.ts` compiles to CommonJS, which can't load `module.mts`, so it is left out. Rename the barrel to `index.mts` to export it too.

## The nearest package.json

Barrelify finds the nearest `package.json` with Node's own lookup ([`module.findPackageJSON`](https://nodejs.org/api/module.html#modulefindpackagejsonspecifier-base)), so a nested `package.json` with its own `"type"` changes the module system of the barrels below it. A malformed nearest `package.json` is an error, as it would be for Node.
