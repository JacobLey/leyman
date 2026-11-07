---
description: The Go implementation of generated-signature, whose signatures, manual sections and manifests match the TypeScript package's exactly.
---

# Go

generated-signature has a Go implementation, held to the same [test vectors](https://github.com/JacobLey/leyman/tree/main/tools/generated-signature/test-vectors) as the TypeScript package: a file signed by either verifies with the other, manual sections merge the same way, and both read and write the same manifests. So a Go generator can share files with TypeScript tooling, and the [ESLint rule](/packages/generated-signature/guides/eslint) checks what it signs. It needs Go 1.26 or later.

```sh
go get github.com/JacobLey/leyman/tools/generated-signature/go@latest
```

```go
import generatedsignature "github.com/JacobLey/leyman/tools/generated-signature/go"

signed, err := generatedsignature.Sign("package foo\n\nconst Value = 123\n", &generatedsignature.SignOptions{
    Message:        nil,
    CommentOptions: generatedsignature.CommentOptions{Comment: generatedsignature.CommentStyle{}, FilePath: "foo.go"},
})
result := generatedsignature.Verify(signed)
```

Go strings are UTF-8, where JavaScript's are UTF-16, so the rules the format takes from JavaScript (its whitespace in manual section markers, manifest paths sorted by UTF-16 code unit) are reproduced rather than taken from Go.

The full API is in the [README](https://github.com/JacobLey/leyman/tree/main/tools/generated-signature/go), and versions are in its [changelog](https://github.com/JacobLey/leyman/blob/main/tools/generated-signature/go/CHANGELOG.md).
