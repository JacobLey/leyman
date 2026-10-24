---
description: Install populate-files, write a generated file, and check it in CI.
---

# Getting started

## Install

::: code-group

```sh [npm]
npm i -D populate-files
```

```sh [pnpm]
pnpm add -D populate-files
```

```sh [yarn]
yarn add -D populate-files
```

:::

::: tip
populate-files requires Node.js 24 or later, and is ESM only. From CommonJS, load it with a dynamic import: `const { populateFiles } = await import('populate-files');`.

To run it from the command line instead of a script, install [`load-populate-files`](/packages/populate-files/guides/config-modules) too.
:::

## Write files

```ts
import { populateFiles } from 'populate-files';

await populateFiles(
    [
        { filePath: 'config.json', content: { port: 8080, hosts: ['a', 'b'] } },
        { filePath: 'banner.txt', content: 'Hello!\n' },
    ],
    { targetDir: './generated' }
);
```

- `filePath` is resolved from `targetDir`, which is resolved from `cwd` (the current directory by default). Missing directories are created.
- A string or a `Uint8Array` is written as is. Any other object is serialized as JSON and formatted with your project's Biome or Prettier config, if either is installed. `content` can also be a `Promise` of any of these.
- A file whose content is already the same isn't written again, so its modification time doesn't change.

Commit the generated files, like any other source file.

## Check files in CI

Run the same script in CI. It checks instead of writing: it computes every file, and fails if any would be created or changed, without writing anything:

```
PopulateFilesCheckError: File /repo/generated/config.json not up to date. Reason: content-changed
```

`check` is on by default when populate-files detects CI (with [ci-info](https://www.npmjs.com/package/ci-info)). Pass `check: true` or `check: false` to choose yourself.

## Remove files that are no longer generated

With `clean: true`, `populateFiles` also removes every file in `targetDir` that it didn't write, so renaming or dropping a file doesn't leave the old one behind. In `check` mode, a file it would remove fails the check (`Reason: stale-file`).

Without a manifest, that is *every* other file in `targetDir`, so only use it on a directory that holds nothing but generated files. With a [manifest](/packages/populate-files/guides/manifest), `clean` only removes files a previous run wrote.

## Next steps

- [Config modules and the CLI](/packages/populate-files/guides/config-modules): describe files in a module, and write them with `load-populate-files`.
- [Signed files](/packages/populate-files/guides/signed-files): detect hand edits, and leave parts of a file for people to edit.
- [Manifest](/packages/populate-files/guides/manifest): detect edits to JSON files, and `clean` safely.
- [API reference](/packages/populate-files/reference/api): every option, result and error.
