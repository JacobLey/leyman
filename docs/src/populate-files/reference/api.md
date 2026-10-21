---
description: populateFile, populateFiles and loadAndPopulateFiles, with every param, option, result and error.
---

# API

Both packages are ESM only. From CommonJS, load them with a dynamic import: `const { populateFiles } = await import('populate-files');`.

## `populateFile(params, options?)`

Writes one file, from `populate-files`.

```ts
import { populateFile } from 'populate-files';

const result = await populateFile({ filePath: './out/config.json', content: { port: 8080 } });
//    ^?
```

**Returns** `Promise<PopulationResponse>`: whether the file was written (or, with `dryRun`, would be), and why:

| `updated` | `reason` | Meaning |
|-----------|----------|---------|
| `false` | | The file already had this content. |
| `true` | `'file-not-exist'` | The file was created. |
| `true` | `'content-changed'` | The file was overwritten. |
| `true` | `'stale-file'` | The file was removed by `clean` (`populateFiles` only). |

With `check`, any of the `updated` results throws instead: `File <path> not up to date. Reason: <reason>`.

### `params`

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `filePath` | `string` | — | Required. Path of the file, resolved from `targetDir`. |
| `content` | `string \| Uint8Array \| object \| Promise` | — | Required. A string or `Uint8Array` is written as is. Any other object is serialized as JSON and formatted with the project's Biome or Prettier config. A `Promise` resolving to any of these is awaited. Must be a string (or a `Promise` of one) when `signed`. |
| `signed` | `boolean` | `false` | Sign the file and keep its manual sections. See [Signed files](/populate-files/guides/signed-files). |
| `manifestInputs` | `Record<string, string>` | — | With `manifest`, recorded in the file's entry. See [Recording inputs](/populate-files/guides/manifest#recording-inputs). |

The type is `PopulateFileParams`, exported by both packages. `signed: true` narrows `content` to strings:

```ts
// @errors: 1360
import type { PopulateFileParams } from 'populate-files';

const file = {
    filePath: 'data.ts',
    content: { a: 1 },
    signed: true,
} satisfies PopulateFileParams;
```

### `options`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `check` | `boolean` | `true` in CI, else `false` | Don't write. Throw if any file would be created, changed or removed. |
| `dryRun` | `boolean` | `false` | Don't write, but return what would change. Still throws with `check`. |
| `cwd` | `string \| URL` | the current directory | Directory that `targetDir` and `manifest` are resolved from. |
| `targetDir` | `string` | `'.'` | Directory that `filePath`s are resolved from, relative to `cwd`. |
| `clean` | `boolean` | `false` | `populateFiles` only. Remove files no longer generated: every other file in `targetDir`, or with `manifest` only files the previous manifest lists. See [Clean](/populate-files/guides/manifest#clean). |
| `force` | `boolean` | `false` | Overwrite or remove files despite an [ownership error](#errors), and drop orphaned manual sections. |
| `manifest` | `string` | — | Path of a [manifest](/populate-files/guides/manifest) recording the generated files, relative to `cwd`. |

## `populateFiles(params, options?)`

Writes several files in parallel, from `populate-files`. `params` is an array of [`populateFile` params](#params), with unique `filePath`s (it rejects with a `TypeError` if two resolve to the same path), and `options` are the [same](#options).

```ts
import { populateFiles } from 'populate-files';

const results = await populateFiles(
    [
        { filePath: 'a.json', content: { a: 1 } },
        { filePath: 'b.txt', content: 'b\n' },
    ],
    { targetDir: './out', clean: true }
);
```

**Returns** `Promise<PopulationResponse[]>`: one result per file, then one for the manifest (with `manifest`), then one per file removed by `clean`.

With `check`, every file is computed first, and one error lists everything out of date. An [ownership error](#errors) is thrown as soon as it is found.

## `loadAndPopulateFiles(params, options?)`

Loads files from a [config module](/populate-files/guides/config-modules), and passes them to `populateFiles`. From `load-populate-files`.

```ts
import { loadAndPopulateFiles } from 'load-populate-files';

await loadAndPopulateFiles({ filePath: './dist/file-content.js' }, { targetDir: './out' });
```

| Param | Type | Description |
|-------|------|-------------|
| `params.filePath` | `string` | Required. The config module, resolved from `options.cwd`. Its default export is one `PopulateFileParams`, or an array of them. |
| `options` | `object` | Optional. The same as [`populateFiles` options](#options). |

**Returns** `Promise<PopulationResponse[]>`, from `populateFiles`.

**Throws** `Error` if the module doesn't exist, or its default export isn't a valid config.

## Errors

`PopulateFilesOwnershipError` extends the abstract `PopulateFilesError`. It is thrown when an existing file can't be overwritten (or removed by `clean`) without losing someone's edits. It is thrown with or without `check`, and `force` skips it.

| Property | Type | Description |
|----------|------|-------------|
| `filePath` | `string` | Absolute path of the file. |
| `reason` | `OwnershipReason` | Why, below. |

| `reason` | Meaning |
|----------|---------|
| `'edited'` | A signed file was edited outside its manual sections, or a file doesn't match its manifest hash. |
| `'not-owned'` | The file exists, but isn't signed (for `signed` files) or isn't listed in the manifest. It may be handwritten. |
| `'malformed'` | A signed file's token or manual section markers can't be read. |
| `'orphaned-section'` | A signed file has a manual section with content that the new content doesn't have. |

```ts
import { populateFile, PopulateFilesOwnershipError } from 'populate-files';

try {
    await populateFile({ filePath: 'version.ts', content: 'export {};\n', signed: true });
} catch (error) {
    if (error instanceof PopulateFilesOwnershipError) {
        console.error(`${error.filePath}: ${error.reason}`);
        //                                        ^?
    }
    throw error;
}
```

An existing file that can't be read for any reason other than not existing, such as `EACCES`, fails with the error from `node:fs`, rather than being treated as a new file.

Errors from [`generated-signature`](/generated-signature/reference/api#errors) are passed through: `GeneratedSignatureManifestError` for an invalid manifest, and `GeneratedSignatureCommentStyleError` for a `signed` file with no known comment syntax.
