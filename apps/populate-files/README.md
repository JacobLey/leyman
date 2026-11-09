# populate-files

Populate static files with dynamic content, and make sure they stay in sync.

populate-files writes generated files from code, and checks in CI that they are up to date. It has a TypeScript and a Go implementation, which follow the same rules, so files and manifests written by one are read the same way by the other.

- A file whose content is already up to date is left alone, and each result says whether it was updated.
- A check writes nothing, and fails if any file is out of date.
- Every file is decided before any is written or removed, so a failure leaves every file as it was.
- A file can be signed with [generated-signature](../../tools/generated-signature/), so its manual sections are kept when it is regenerated, and a hand edit outside them is refused unless forced.
- Generated files can be recorded in a manifest, with hashes of the inputs they were generated from. A clean then removes only the listed files that are no longer generated.

## Packages

| Package | Status |
|---------|--------|
| [`ts`](./ts/) | Published to npm as [`populate-files`](https://www.npmjs.com/package/populate-files) |
| [`go`](./go/) | The Go implementation, released as the Go module `github.com/JacobLey/leyman/apps/populate-files/go` |
| [`load-populate-files`](./load-populate-files/) | Published to npm as [`load-populate-files`](https://www.npmjs.com/package/load-populate-files). It reads the files to populate from a config file, and runs the TypeScript implementation |

The TypeScript and Go implementations run the same [test vectors](./test-vectors/), which are scenarios run in an empty directory, with exactly the results, errors and files each must give.
