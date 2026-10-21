<div style="text-align:center">

# populate-files
Populate static files with dynamic content, and make sure they stay in sync.

[![npm package](https://badge.fury.io/js/populate-files.svg)](https://www.npmjs.com/package/populate-files)
[![License](https://img.shields.io/npm/l/populate-files.svg)](https://github.com/JacobLey/leyman/blob/main/apps/populate-files/populate-files/LICENSE)

</div>

Guides and the full reference are on the [docs site](https://jacobley.github.io/leyman/populate-files/).

## Contents

- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [populateFile](#populatefileparams-options)
  - [populateFiles](#populatefilesparams-options)
  - [Errors](#errors)
- [Signed files](#signed-files)
- [Manifest](#manifest)
- [Also See](#also-see)

## Install

```sh
npm i populate-files
```

## Example

```ts
import { populateFile } from 'populate-files';

// Successfully writes json file!
await populateFile({
    filePath: './foo.json',
    content: { bar: 123 },
});

// Error! File has changed!
await populateFile(
    {
        filePath: './foo.json',
        content: { baz: 456 },
    },
    {
        check: true,
    }
);
```

## Usage

`populate-files` is an ESM module. It must be `import`ed. To load from a CJS module, use dynamic import: `const { populateFiles } = await import('populate-files');`.

Provide the file path and content, and the file will be written. Optionally specify `check: true` to fail when the file content would change — useful for enforcing that generated files are committed and up to date in CI.

By default the file is overwritten whatever it contains. Set `signed: true` to sign it instead, so hand edits are detected and manual sections survive regeneration (see [Signed files](#signed-files)).

## API

### `populateFile(params, options?)`

Writes the provided content to the file at `params.filePath`.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `params` | `object` | — | Required. See [params](#params) below. |
| `options` | `object` | `{}` | Optional. See [options](#options) below. |

**Returns** `Promise<PopulationResponse>`: `{ filePath, updated: false }` if the file already had this content, else `{ filePath, updated: true, reason }` with `reason` `'file-not-exist'` or `'content-changed'`. With `dryRun`, what would have been written.

#### `params`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `filePath` | `string` | — | Required. Path to the file to write (and check for existing content). |
| `content` | `string \| object \| Uint8Array \| Promise` | — | Required. Data to write. Strings and `Uint8Array` (like Buffers) are written literally. An object is `JSON.stringify`ed and pretty-formatted according to user configs. A `Promise` may be provided that resolves to one of these types. Must be a string (or a `Promise` of one) when `signed`. |
| `signed` | `boolean` | `false` | If `true`, sign the file and keep its manual sections. See [Signed files](#signed-files). |
| `manifestInputs` | `Record<string, string>` | — | With the `manifest` option, hashes of what produced the file, recorded in its manifest entry. See [Manifest](#manifest). |

#### `options`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `check` | `boolean` | `true` in CI, else `false` | If `true`, fails if writing the file would change its content. Useful for CI environments to verify version-controlled files are up to date before deployment. |
| `dryRun` | `boolean` | `false` | If `true`, does not write the file regardless of changes. Can still fail if `check` is `true`. |
| `cwd` | `string \| URL` | `process.env.PWD` | Used as the current working directory when `params.filePath` is a relative path. |
| `targetDir` | `string` | `'.'` | Directory used to resolve relative `filePath`s in params. Resolved relative to `cwd`. |
| `clean` | `boolean` | `false` | Only applies to `populateFiles`. If `true`, removes files in `targetDir` that are not in the provided params. In `check` mode, fails instead of removing. |
| `force` | `boolean` | `false` | Applies to `signed` files and the `manifest`. If `true`, overwrites files that were edited (outside manual sections), are not signed or not listed, or are malformed, and drops orphaned manual sections. Use it once when starting to sign an existing file. |
| `manifest` | `string` | — | Path of a manifest file (relative to `cwd`) recording the generated files. See [Manifest](#manifest). |

---

### `populateFiles(params, options?)`

Writes multiple files in parallel. Each `filePath` must be unique: two that resolve to the same path reject with a `TypeError`.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `params` | `PopulateFileParams[]` | — | Required. A list of [populateFile params](#params), with unique `filePath`s. |
| `options` | `object` | `{}` | Optional. Same as [populateFile options](#options). |

**Returns** `Promise<PopulationResponse[]>`: one result per file, then one for the manifest (with `manifest`), then one per file removed by `clean` (`reason: 'stale-file'`).

---

### Errors

`PopulateFilesOwnershipError` (extends the abstract `PopulateFilesError`) is thrown when a `signed` file can't be overwritten without `force`. Its `filePath` property is the file, and `reason` is one of:

| `reason` | Meaning |
|----------|---------|
| `'edited'` | The file was edited outside its manual sections (or, with a `manifest`, doesn't match its hash). |
| `'not-owned'` | The file exists but is not signed (or, with a `manifest`, not listed in it), so it may not be generated. |
| `'malformed'` | The file's signature or manual section markers can't be read. |
| `'orphaned-section'` | The file has a manual section with content that the new content no longer has. |

These are thrown with or without `check`, so CI also fails on hand-edited files. An existing file that can't be read for any reason other than not existing (e.g. `EACCES`) fails with the error from `node:fs`. An invalid manifest throws `GeneratedSignatureManifestError` from [`generated-signature`](https://www.npmjs.com/package/generated-signature).

## Signed files

With `signed: true`, the file gets a [`generated-signature`](https://www.npmjs.com/package/generated-signature) token, and parts of it can be left for people to edit:

```ts
import { manualSection } from 'generated-signature';
import { populateFile } from 'populate-files';

await populateFile({
    filePath: './config.ts',
    content: `export const generated = true;
${manualSection({ id: 'overrides', body: 'export const timeout = 1000;', filePath: './config.ts' })}
`,
    signed: true,
});
```

On each write:

1. If the file exists, it must have a valid signature (unless `force`): someone editing outside a manual section, or a file that was never signed, fails with a [`PopulateFilesOwnershipError`](#errors) instead of losing their work.
2. Each manual section's content is taken from the existing file, matched by id. A section the new content no longer has fails the write if it has content, unless `force`.
3. The result is signed. A signature line is inserted at the top, using the file's comment syntax, unless the content already contains a token, e.g. from `signatureToken()` in a generator's own header.

`check` compares the result, so a file whose manual sections were edited is still up to date. Files without comments, like JSON, can't be signed: use a [manifest](#manifest) instead.

## Manifest

With `manifest: './generated.json'`, a run records every file it writes in a [`generated-signature` manifest](https://www.npmjs.com/package/generated-signature#manifest): a hash for each unsigned file, and `signature: "inline"` for each `signed` one.

```ts
await populateFiles(
    [
        { filePath: 'schema.json', content: schema },
        { filePath: 'types.ts', content: types, signed: true },
    ],
    { targetDir: './out', manifest: './out/generated.json', clean: true }
);
```

- **Edits are detected for any file type.** An unsigned file that exists but doesn't match its hash fails with `edited`, and one the manifest doesn't list fails with `not-owned`, unless `force`. A file that already has exactly the content being written is fine, so adding a manifest to existing output needs no `force`. Signed files are still checked by their own token.
- **`clean` only removes files the manifest lists.** Files the previous manifest lists that this run doesn't write are removed (failing with `edited` if they were changed, unless `force`). Nothing else in `targetDir` is touched, so the output can share a directory with other files.
- **The manifest is a generated file too.** It lists exactly this run's files. `check` fails if it would change, and `dryRun` doesn't write it. `populateFile` updates only its own file's entry, keeping the others. Calls writing the same manifest must not run concurrently: use one `populateFiles` call instead.
- **`manifestInputs`** on a file records hashes of what produced it (e.g. source files and the generator's version), so a generator can tell its output is up to date without regenerating.

## Also See

- [`load-populate-files`](https://www.npmjs.com/package/load-populate-files) — loads file configs from a separate module and calls `populateFiles` for you
- [`generated-signature`](https://www.npmjs.com/package/generated-signature) — the signature and manual section format used by `signed` files
- [`format-file`](https://www.npmjs.com/package/format-file) — used internally to pretty-print stringified file content
- [`parse-cwd`](https://www.npmjs.com/package/parse-cwd) — used internally to interpret the `cwd` option
