# populate-files-go

## 0.1.2

- The `OwnershipNotOwned` error message fits both of its causes: `File <path> exists but is not marked as generated (not signed)` for a signed file, and `(not listed in the manifest)` for an unsigned file with a manifest. It read "exists but is not signed, so it may not be generated" for both.

## 0.1.1

- Stale files are removed and reported in UTF-16 code unit order of their paths, with or without a manifest, as the TypeScript package now does. Without a manifest they were in depth-first order, and with one in byte order, which differs for characters beyond U+FFFF.
- A manifest listing one file by two paths (like `a.json` and `./a.json`) fails with `ErrManifest`, naming both, rather than using either entry at random.

## 0.1.0

- First release: the Go implementation of populate-files, held to the same test vectors as the TypeScript package.
