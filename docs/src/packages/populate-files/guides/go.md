---
description: The Go implementation of populate-files, which writes and checks generated files with the same rules, and reads the files and manifests the TypeScript package writes.
---

# Go

populate-files has a Go implementation, held to the same [test vectors](https://github.com/JacobLey/leyman/tree/main/apps/populate-files/test-vectors) as the TypeScript package. It decides the same writes, refusals and check failures, and each reads the files and manifests the other writes. It needs Go 1.24 or later.

```sh
go get github.com/JacobLey/leyman/apps/populate-files/go@latest
```

```go
import populatefiles "github.com/JacobLey/leyman/apps/populate-files/go"

results, err := populatefiles.PopulateFiles([]populatefiles.File{
    {Path: "types.go", Content: []byte(source), Signed: true},
}, populatefiles.Options{TargetDir: "gen", Manifest: "gen/manifest.json", Clean: true})
```

`PopulateFile` writes one file, keeping the manifest's other entries, and `PopulateFiles` writes a set whose manifest lists exactly those files. Compared to the TypeScript package:

- Content is bytes. Nothing is formatted, including manifests, so a project that formats its manifest with Biome or Prettier sees a different layout (the same entries).
- `Check` is a plain option, where the TypeScript package defaults it to whether it runs in CI.
- There is no config module or CLI. [genever's Go implementation](/packages/genever/guides/go) writes through it.

The full API is in the [README](https://github.com/JacobLey/leyman/tree/main/apps/populate-files/go), and versions are in its [changelog](https://github.com/JacobLey/leyman/blob/main/apps/populate-files/go/CHANGELOG.md).
