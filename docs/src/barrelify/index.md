---
description: Generate and CI-verify TypeScript barrel (index.ts) files with the correct ESM/CJS import extensions.
---

# Barrelify

Generate and CI-verify TypeScript barrel (`index.ts`) files, with import extensions that resolve under Node ESM and TypeScript's `nodenext`.

Start an `index.ts` with `// AUTO-BARREL`:

```ts
// AUTO-BARREL
```

Run `npx barrelify`, and it re-exports every sibling file:

```ts
// @noErrors
// AUTO-BARREL

export * from './button.js';
export * from './legacy.cjs';
export * from './theme.mjs';
```

Commit the result, and run `barrelify --ci` in CI to fail when a barrel is out of date.

**[Get started →](/barrelify/getting-started)**

## Features

- **Specifiers that resolve**: Writes `./foo.js`, `./foo.cjs` and `./foo.mjs`, never extensionless paths. A `.tsx` component exports as `./Button.js`, matching TypeScript's output.
- **ESM/CJS aware**: Reads the nearest `package.json` `"type"`, and only re-exports files the barrel can load. A CommonJS barrel never re-exports an `.mts` file. See [Module systems](/barrelify/guides/module-systems).
- **Opt-in**: Only rewrites index files that start with `// AUTO-BARREL`. It never creates files or touches hand-written barrels.
- **CI check**: `barrelify --ci` fails when a committed barrel is stale, and is the default in CI.
- **Keeps type-only exports**: A line changed to `export type *` stays type-only on later runs.

## Compared to

[barrelsby](https://www.npmjs.com/package/barrelsby) and [ctix](https://www.npmjs.com/package/ctix) generate barrels across a directory tree from configuration. Barrelify has no configuration: one marker per file opts it in, and each barrel only covers its own directory.
