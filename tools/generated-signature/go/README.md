# generated-signature-go

Go implementation of [generated-signature](../ts/), tested against the shared [test vectors](../test-vectors/).

A file signed by either implementation verifies with the other, manual sections merge the same way, and both read and write the same manifests, so a Go generator (like the Go port of [genever](../../../apps/genever/)) can share files with TypeScript tooling.

```go
import generatedsignature "github.com/JacobLey/leyman/tools/generated-signature/go"

section, _ := generatedsignature.RenderManualSection(generatedsignature.ManualSectionOptions{
    ID:             "value",
    Body:           "const Value = 123",
    Indent:         "",
    CommentOptions: generatedsignature.CommentOptions{Comment: generatedsignature.CommentStyle{}, FilePath: "foo.go"},
})
merged, _ := generatedsignature.MergeSections("package foo\n\n"+section+"\n", existing)
signed, _ := generatedsignature.Sign(merged.Text, &generatedsignature.SignOptions{
    Message:        nil,
    CommentOptions: generatedsignature.CommentOptions{Comment: generatedsignature.CommentStyle{}, FilePath: "foo.go"},
})

generatedsignature.Verify(signed).Status // "valid"
```

The API follows the TypeScript package's, with Go's conventions:

| TypeScript                                                                 | Go                                                                         |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `sign(text, options?)`                                                     | `Sign(text, *SignOptions)`, a nil `Message` for the default                |
| `signatureToken()`                                                         | `SignatureToken()`                                                         |
| `verify(text)`                                                             | `Verify(text)`, a `VerifyResult` with `Err` set when malformed             |
| `parseSections(text)`                                                      | `ParseSections(text)`, a slice in file order                               |
| `mergeSections({ generated, existing })`                                   | `MergeSections(generated, existing)`                                       |
| `manualSection(options)`                                                   | `RenderManualSection(options)`                                             |
| `commentStyle(filePath)`                                                   | `StyleFor(filePath)`                                                       |
| `contentHash`, `verifyManifestEntry`, `parseManifest`, `serializeManifest` | `ContentHash`, `VerifyManifestEntry`, `ParseManifest`, `SerializeManifest` |

Errors match with `errors.Is`: `ErrMalformed` (a `*MalformedError` with its `Reason` and `Line`), `ErrNoCommentStyle`, `ErrUnknownCommentStyle`, `ErrSectionID` and `ErrManifest`.

Strings are UTF-8, where JavaScript's are UTF-16, so the whitespace, case and ordering rules that the format takes from JavaScript are reproduced rather than taken from Go: manual section markers and blank checks use JavaScript's whitespace, and manifests sort paths by UTF-16 code unit. Text with invalid UTF-8 is hashed as it is.

It is not published as a Go module (yet).

## Development

Run through Nx, like any other project:

```sh
nx run @leyman/generated-signature-go:verify
```

It has no `package.json`. The [test vectors](../test-vectors/) are a Go dependency: `go.mod` requires their module, with a `replace` pointing at the workspace copy, and the tests import it. Nx (through the gonx plugin) infers the dependency from that import, so `go test ./...` also works directly.
