# populate-files

Populate static files with dynamic content, and make sure they stay in sync.

Every implementation follows the same rules, so files and manifests written by one are read the same way by every other:

- **Written only when changed**: a file whose content is already up to date is left alone, and each result says whether it was updated.
- **Checks for CI**: a check writes nothing, and fails if any file is out of date.
- **All or nothing**: every file is decided before any is written or removed, so a failure leaves every file as it was.
- **Signed files**: a file can be signed with [generated-signature](../../tools/generated-signature/), so its manual sections are kept when it is regenerated, and a hand edit outside them is refused unless forced.
- **Manifest**: generated files can be recorded in a manifest, with hashes of the inputs they were generated from, so a clean can remove the files it lists that are no longer generated, and nothing else.

## Packages

| Package | Status |
|---------|--------|
| [`ts`](./ts/) | Published to npm as [`populate-files`](https://www.npmjs.com/package/populate-files) |
| [`go`](./go/) | The Go implementation, in this repository only |
| [`load-populate-files`](./load-populate-files/) | Published to npm as [`load-populate-files`](https://www.npmjs.com/package/load-populate-files): reads the files to populate from a config file, and runs the TypeScript implementation |

The TypeScript and Go implementations run the same [test vectors](./test-vectors/): scenarios run in an empty directory, with exactly the results, errors and files each must give.
