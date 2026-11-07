# populate-files-test-vectors

Scenarios shared by every [populate-files](../ts/) implementation.

Each implementation runs every scenario in an empty directory and asserts that it gives exactly these results, errors and files. So the TypeScript package and the [Go implementation](../go/) decide the same writes, refusals and check failures, and each reads the files and manifests the other writes.

```ts
import testVectors from '@leyman/populate-files-test-vectors/test-vectors.json' with { type: 'json' };
```

Implementations in other languages, such as the [Go implementation](../go/), read [`data/test-vectors.json`](./data/test-vectors.json) by path, from the working copy, so a published module needs no module of vectors.

## Format

```json
{
  "scenarios": [
    {
      "description": "Keeps manual sections when regenerating",
      "setup": [{ "call": "populateFile", "files": [{ "filePath": "b.ts", "content": "…", "signed": true }], "options": { "targetDir": "out" } }],
      "writes": { "out/other.txt": "mine\n" },
      "edits": [{ "filePath": "out/b.ts", "from": "custom = 1", "to": "custom = 2" }],
      "call": "populateFile",
      "files": [{ "filePath": "b.ts", "content": "…", "signed": true }],
      "options": { "targetDir": "out" },
      "results": [{ "filePath": "out/b.ts", "updated": true, "reason": "content-changed" }],
      "after": { "out/b.ts": "…", "out/other.txt": "mine\n" }
    }
  ]
}
```

A scenario runs in an empty directory, which is the `cwd` of every call:

1. Each `setup` call, which must succeed.
2. Each of `writes`: a file's content, or `null` to remove it.
3. Each of `edits`: replace the first `from` in a file with `to`.
4. The `call` (`populateFile` with its one file, or `populateFiles`), with `check: false` unless `options` say otherwise.

The call then either gives `results` or fails with an `error`. Paths are relative to the directory, with `/`. An `error` has a `kind`: `check` (with the outdated `files` and their reasons), `ownership` (with its `filePath` and `reason`), `manifest` or `duplicate-file`.

After the call, whether it succeeds or fails (a failed call writes nothing), `after` is every file in the directory except manifests. When the call has a manifest, `manifest` is its parsed `files`, or `null` when it isn't written. Manifests are compared parsed, as their layout is up to a formatter: the TypeScript package formats them with Biome or Prettier when the project has one.

Content is text. Signed files' expected content pins the signature format, which [generated-signature's vectors](../../../tools/generated-signature/test-vectors/) cover in detail.

It is not published, and should not be depended on by published code.
