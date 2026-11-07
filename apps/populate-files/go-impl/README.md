# populate-files-go

Go implementation of [populate-files](../populate-files/), tested against the shared [test vectors](../test-vectors/).

It writes generated files and keeps them in sync, with the same rules as the TypeScript package: a check fails on files that are out of date, signed files keep their manual sections and refuse to overwrite hand edits, and a manifest records the generated files so stale ones can be cleaned. It signs with the [Go implementation of generated-signature](../../../tools/generated-signature/go/), so the files and manifests it writes are read the same way by the TypeScript tools.

```go
import populatefiles "github.com/JacobLey/leyman/apps/populate-files/go-impl"

results, err := populatefiles.PopulateFiles([]populatefiles.File{
    {ManifestInputs: nil, Path: "types.go", Content: []byte(source), Signed: true},
}, populatefiles.Options{
    Cwd: "", TargetDir: "gen", Manifest: "gen/manifest.json", Check: false, DryRun: false, Force: false, Clean: true,
})
```

`PopulateFile` writes one file, keeping the manifest's other entries. `PopulateFiles` writes a set of files, and its manifest lists exactly those. Errors match with `errors.Is`: `ErrCheck` (a `*CheckError` listing the outdated files), `ErrOwnership` (an `*OwnershipError` with its `Reason`) and `ErrDuplicateFile`, plus generatedsignature's errors for malformed content or manifests.

Compared to the TypeScript package:

- Content is bytes. Nothing is formatted: JSON content is the caller's to write, and manifests are written as `generatedsignature.SerializeManifest` writes them, so a project that formats its manifest with Biome or Prettier sees a different layout (the same entries).
- `Check` is a plain option, where the TypeScript package defaults it to whether it runs in CI.
- Stale files without a manifest are found in sorted order.

It is not published as a Go module (yet).

## Development

Run through Nx, like any other project:

```sh
nx run @leyman/populate-files-go:verify
```

It has no `package.json`. The [test vectors](../test-vectors/) and generated-signature are Go dependencies: `go.mod` requires their modules, with `replace` directives pointing at the workspace copies, and the code imports them. Nx (through the gonx plugin) infers the dependencies from those imports, so `go test ./...` also works directly.
