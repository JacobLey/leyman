---
description: Generate and CI-verify TypeScript barrel (index.ts) files with the correct ESM/CJS import extensions.
---

# Barrelify

<ProjectHeader />

A barrel file is an `index.ts` that re-exports the other files in its directory. Barrelify writes them for you, with import extensions that resolve under Node ESM and TypeScript's `nodenext`, and checks in CI that they are up to date.

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

**[Get started →](/packages/barrelify/getting-started)**

## Features

- Exports use `./foo.js`, `./foo.cjs` and `./foo.mjs`, and never extensionless paths. A `.tsx` component exports as `./Button.js`, matching TypeScript's output.
- It reads the nearest `package.json` `"type"`, and only re-exports files the barrel can load, so a CommonJS barrel doesn't re-export an `.mts` file. See [Module systems](/packages/barrelify/guides/module-systems).
- It only rewrites index files that start with `// AUTO-BARREL`. It doesn't create files, and leaves hand-written barrels alone.
- `barrelify --ci` fails when a committed barrel is out of date, and is the default in CI.
- A line changed to `export type *` stays type-only on later runs.

## Compared to

[barrelsby](https://www.npmjs.com/package/barrelsby) and [ctix](https://www.npmjs.com/package/ctix) generate barrels across a directory tree from configuration. Barrelify has no configuration. One marker per file opts it in, and each barrel only covers its own directory, plus its subdirectories' index files [when asked](/packages/barrelify/getting-started#subdirectories).

## Related

<ProjectRelated />
