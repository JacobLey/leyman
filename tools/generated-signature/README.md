# generated-signature

Sign generated files so hand edits are detected, while keeping manual sections editable.

generated-signature writes a signature into generated files, so a hand edit can be detected later, and leaves manual sections in them for people to edit. It has a TypeScript and a Go implementation, which read and write the same files, so a file one signs, merges or lists in a manifest is read the same way by the other.

The signature is `@generated-signature v1:` and 32 hex characters, once anywhere in the file. The hash is SHA-256 (first 128 bits) of the file with line endings normalized, the token's own hash zeroed, and every manual section's body left out. Checking it needs only the file, not the generator.

A manual section is the lines between `@manual-start <id>` and `@manual-end <id>`, which a person may edit. They are left out of the signature, and carried over when the file is regenerated. The markers take up whole lines, so verifying a file doesn't need its comment syntax, and each implementation renders markers in the comments of common file types.

Files that can't hold a comment, like JSON, are recorded by hash in a JSON manifest instead, along with the inputs they were generated from.

A valid signature means nobody edited the file, not that regenerating it would produce the same output.

## Implementations

| Implementation | Status |
|----------------|--------|
| [`ts`](./ts/) | Published to npm as [`generated-signature`](https://www.npmjs.com/package/generated-signature), with an ESLint rule |
| [`go`](./go/) | Released as the Go module `github.com/JacobLey/leyman/tools/generated-signature/go` |

Each implementation is held to the shared [test vectors](./test-vectors/), and must give exactly the same signatures, verify results, sections, merges, hashes and manifests.
