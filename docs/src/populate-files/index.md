---
description: Write generated files from code, commit them, and fail CI when they are out of date or were edited by hand.
---

# populate-files

Write generated files from code, commit them, and fail CI when they are out of date or were edited by hand.

Describe the files in a module:

```ts
// src/file-content.ts
import type { PopulateFileParams } from 'load-populate-files';

export default [
    { filePath: 'schema.json', content: { type: 'object', required: ['id'] } },
    { filePath: 'version.ts', content: "export const version = '1.2.3';\n", signed: true },
] satisfies PopulateFileParams[];
```

Run `load-populate-files --file-path ./dist/file-content.js --target-dir ./out`, and it writes `out/schema.json`, formatted with your project's Biome or Prettier config, and a signed `out/version.ts`:

```ts
// @generated-signature v1:cecd05739860e0fb35c62d03ed813b26 Generated file. Do not edit outside of manual sections.
export const version = '1.2.3';
```

Commit the output. In CI, the same command checks instead of writing, and fails when a file would change.

**[Get started →](/populate-files/getting-started)**

## Features

- **Up to date in CI**: `check` (`--ci`) computes every file without writing and fails if any would change. It is on by default in CI.
- **Any content**: strings and bytes are written as is. Objects are written as JSON, formatted like the rest of your project.
- **Hand edits are caught**: a [signed](/populate-files/guides/signed-files) file carries a hash of its content. Editing it fails the next run, in CI too, and an [ESLint rule](/generated-signature/guides/eslint) shows it in the editor.
- **Manual sections**: parts of a signed file can be left for people to edit. Their content survives regeneration.
- **A manifest for everything else**: files that can't hold a comment, like JSON, are hashed in a [manifest](/populate-files/guides/manifest) instead. It also makes `clean` remove only files a previous run wrote.
- **Two packages**: `populate-files` is the API. `load-populate-files` adds a CLI that loads the files from a [config module](/populate-files/guides/config-modules).

## Compared to

- A script with `fs.writeFile` and a `git diff --exit-code` step in CI checks freshness too, but needs git, overwrites hand edits without warning, and leaves deleted outputs behind.
- [cog](https://nedbatchelder.com/code/cog/) generates regions inside handwritten files, and checks them with `--check`. populate-files is the inverse: the file is generated, and [manual sections](/populate-files/guides/signed-files#manual-sections) are the handwritten regions.
- [Nx generators](https://nx.dev/features/generate-code) and [Plop](https://www.npmjs.com/package/plop) scaffold files once, for people to edit afterwards. populate-files owns its files, and regenerates them on every run.
