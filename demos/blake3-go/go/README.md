# demo-blake3-go

BLAKE3 from [the crate](../rust/README.md), compiled to WASM and run by [wazero](https://wazero.io), so Go calls Rust with no cgo. Part of the [BLAKE3 from Go through WASM demo](../README.md).

```go
import blake3 "github.com/JacobLey/leyman/demos/blake3-go/go"

module, err := blake3.Compile(ctx, wazero.NewRuntimeConfig())
defer module.Close(ctx)

hasher, err := module.NewHasher(ctx)
hash, err := hasher.Hash(ctx, []byte("hello"))
```

- **Compile once, instantiate per goroutine.** A `Module` is the compiled WASM, and safe to share. A `Hasher` is one instance of it, with its own memory, which isn't safe for concurrent use. Instantiating takes 0.7 ms, 20x less than compiling but far more than a hash, so keep a `Hasher` rather than make one per call (see [the bench](../README.md#what-was-measured)).
- **The config is wazero's.** `wazero.NewRuntimeConfig()` picks the compiler on amd64 and arm64, and the interpreter elsewhere. It also takes a compilation cache, a memory limit, and whether a cancelled `context` stops a call (`WithCloseOnContextDone`).
- **The input is copied in.** WASM can only read its own memory, so `Hash` writes the bytes there first. The room for them is reserved once and reused, growing only for a larger input, and arguments go through `CallWithStack` with a reused slice, so a call allocates nothing in Go. The 32-byte result is read back out the same way.
- **A trap is an error.** The crate aborts on a panic, which wazero returns from the call, as it does for running out of memory. The instance isn't usable after that, so close it and make another.
- **Inputs up to 4 GiB.** WASM's memory is 32-bit. A larger input returns `ErrTooLarge`, though the memory limit, if set, is reached sooner.

```sh
nx run @leyman/demo-blake3-go:verify

# The bench, which `verify` doesn't run
go test -run '^$' -bench . -benchtime 2s
```
