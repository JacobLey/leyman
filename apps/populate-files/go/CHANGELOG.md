# populate-files-go

## 0.2.0

- **Breaking:** `Clean` without a `Manifest` fails with `ErrInvalidOptions`, rather than removing every file in the target directory that isn't generated (with an empty `TargetDir`, the whole working directory). Add a `Manifest`, so `Clean` only removes files an earlier run wrote, or set `UnsafeCleanUnlisted: true` to keep the old behaviour. `UnsafeCleanUnlisted` without `Clean`, or with a `Manifest`, also fails with `ErrInvalidOptions`.
- The `OwnershipNotOwned` error message fits both of its causes: `File <path> exists but is not marked as generated (not signed)` for a signed file, and `(not listed in the manifest)` for an unsigned file with a manifest. It read "exists but is not signed, so it may not be generated" for both.

## 0.1.1

- Stale files are removed and reported in UTF-16 code unit order of their paths, with or without a manifest, as the TypeScript package now does. Without a manifest they were in depth-first order, and with one in byte order, which differs for characters beyond U+FFFF.
- A manifest listing one file by two paths (like `a.json` and `./a.json`) fails with `ErrManifest`, naming both, rather than using either entry at random.

## 0.1.0

- First release: the Go implementation of populate-files, held to the same test vectors as the TypeScript package.
