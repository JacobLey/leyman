# constant-consistent-hash-go

Go implementation of [constant-consistent-hash](../constant-consistent-hash/), tested against the shared test vectors.

It is written from the [specification](../constant-consistent-hash/SPEC.md), not translated from the TypeScript source, so the two agreeing on every [test vector](../test-vectors/) checks that the specification is complete and unambiguous. Go also has different integer semantics (shifting a `uint32` by 32 gives 0, where JavaScript does not shift at all), which catches mistakes that a second JavaScript implementation would repeat.

```go
import consistenthash "github.com/JacobLey/leyman/tools/constant-consistent-hash/go-impl"

bucket, err := consistenthash.Bucket("00000000-0000-4000-8000-000000000000", 7, 0)
// 2
```

`Bucket(key, buckets, seed)` returns a bucket in `[0, buckets)`, or `ErrBuckets` when `buckets` is not between 1 and 2^48. The key is hashed as its bytes, so give it as UTF-8 to match other languages.

It is not published as a Go module (yet), and only exists to test the specification.

## Development

Run through Nx, like any other project:

```sh
nx run @leyman/constant-consistent-hash-go:verify
```

It has no `package.json`. The [test vectors](../test-vectors/) are a Go dependency: `go.mod` requires their module, with a `replace` pointing at the workspace copy, and the tests import it. Nx (through the gonx plugin) infers the dependency from that import, so `go test ./...` also works directly.
