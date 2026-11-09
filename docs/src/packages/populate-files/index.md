---
description: Write generated files from code, commit them, and fail CI when they are out of date or were edited by hand.
---

# populate-files

<ProjectHeader />

Generated files that are committed, like a JSON schema built from code, have to be regenerated whenever their inputs change, and nothing stops someone from forgetting, or from editing the output by hand.

populate-files writes those files from code, and fails CI when they are out of date or were edited by hand. Describe the files in a module:

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

**[Get started →](/packages/populate-files/getting-started)**

## Features

- `check` (`--ci`) computes every file without writing, and fails if any would change. It is on by default in CI.
- Strings and bytes are written as they are. Objects are written as JSON, formatted like the rest of your project.
- A [signed](/packages/populate-files/guides/signed-files) file carries a hash of its content, so editing it by hand fails the next run, in CI too. An [ESLint rule](/packages/generated-signature/guides/eslint) shows the edit in the editor.
- Parts of a signed file can be left as manual sections for people to edit, and their content is kept when the file is regenerated.
- Files that can't hold a comment, like JSON, are hashed in a [manifest](/packages/populate-files/guides/manifest) instead. The manifest also makes `clean` remove only files an earlier run wrote.
- `populate-files` is the API, and `load-populate-files` adds a CLI that loads the files from a [config module](/packages/populate-files/guides/config-modules).
- A [Go implementation](/packages/populate-files/guides/go) writes and checks files with the same rules.

## Compared to

- A script with `fs.writeFile` and a `git diff --exit-code` step in CI checks freshness too, but needs git, overwrites hand edits without warning, and leaves deleted outputs behind.
- [cog](https://nedbatchelder.com/code/cog/) generates regions inside handwritten files, and checks them with `--check`. populate-files works the other way around, since the whole file is generated and [manual sections](/packages/populate-files/guides/signed-files#manual-sections) are the handwritten regions.
- [Nx generators](https://nx.dev/features/generate-code) and [Plop](https://www.npmjs.com/package/plop) scaffold files once, for people to edit afterwards. populate-files owns its files, and regenerates them on every run.

## Related

<ProjectRelated />
