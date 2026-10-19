---
description: Record generated files in a manifest, to detect edits to JSON files, clean only generated files, and let generators skip work in CI.
---

# Manifest

A [signed file](/populate-files/guides/signed-files) carries its own hash, which needs a comment. With the `manifest` option (`--manifest`), populate-files also records every file it writes in a separate JSON file, so it can:

- detect hand edits to files without comments, like JSON;
- `clean` only files it wrote, so the output can share a directory with other files;
- let a generator record what it read, so it can tell it is up to date without regenerating.

```ts
import { populateFiles } from 'populate-files';

await populateFiles(
    [
        { filePath: 'schema.json', content: { type: 'object' } },
        { filePath: 'types.ts', content: 'export type Schema = object;\n', signed: true },
    ],
    { targetDir: './out', manifest: './out/.generated.json', clean: true }
);
```

```json
// out/.generated.json
{
  "version": 1,
  "files": {
    "schema.json": {
      "hash": "v1:59dd9138acc693310fce4722159a0224"
    },
    "types.ts": {
      "signature": "inline"
    }
  }
}
```

The manifest path is resolved from `cwd`, not `targetDir`, so it can sit outside the output. Paths in it are relative to the manifest. Commit it with the files it lists. The format is part of [`generated-signature`](/generated-signature/reference/format#manifest).

## Hand edits

Before overwriting an unsigned file that exists and would change, populate-files checks the manifest:

| The existing file | Result |
|-------------------|--------|
| Is listed, and matches its hash | Overwritten. |
| Is listed, but doesn't match its hash | `PopulateFilesOwnershipError`, reason `'edited'`. |
| Isn't listed | `PopulateFilesOwnershipError`, reason `'not-owned'`. |
| Already has exactly the new content | Left alone, and added to the manifest. |

As for signed files, these fail with or without `check`, and `force` overwrites anyway. Signed files are listed as `"signature": "inline"`, and checked by their own token, so their [manual sections](/populate-files/guides/signed-files#manual-sections) still work.

The last row means adding a manifest to existing output needs no `force`: run once, and every file that is already up to date is adopted.

## Clean

With a manifest, `clean` removes the files the *previous* manifest lists that this run doesn't write, and nothing else. A listed file that was edited since fails with `'edited'` instead of being removed, unless `force`.

Without a manifest, `clean` removes every file in `targetDir` that this run didn't write.

## The manifest is generated too

- It lists exactly the files of the last run, and is rewritten after it. With `check`, a manifest that would change fails the check like any other file. `dryRun` doesn't write it.
- `populateFile` (one file) updates only its own entry, and keeps the others. Separate calls writing the same manifest must not run at the same time: write the files with one `populateFiles` call instead.
- It is never checked for edits. Editing it by hand, e.g. to accept a change to a generated file, is deliberate.
- An invalid manifest fails the run with `GeneratedSignatureManifestError`, from `generated-signature`.

## Recording inputs

A generator can record hashes of what produced a file with `manifestInputs`. populate-files writes them to the file's entry, and doesn't read them:

```ts
declare const source: string; // the content of ./schema.yaml
// ---cut---
import { contentHash } from 'generated-signature';
import { populateFile } from 'populate-files';

await populateFile(
    {
        filePath: './schema.json',
        content: { title: 'converted from schema.yaml' },
        manifestInputs: { generator: 'my-generator@1.0.0', './schema.yaml': contentHash(source) },
    },
    { manifest: './.generated.json' }
);
```

Next time, the generator can read the manifest with [`parseManifest`](/generated-signature/reference/api#manifest), and when every input still matches and the output is unedited (`verifyManifestEntry`), skip regenerating. That matters when generating is slow or needs the network. [genever](/genever/guides/references#checking-without-fetching) does this so `--ci` never fetches remote schemas.
