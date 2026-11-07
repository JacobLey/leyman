package blake3_test

// Run with `go test -run '^$' -bench . -benchtime 2s`. Not run by `go-test`, which only runs tests.

import (
	"context"
	"fmt"
	"testing"

	blake3 "github.com/JacobLey/leyman/demos/blake3-go/go"
	"github.com/tetratelabs/wazero"
	zeebo "github.com/zeebo/blake3"
)

// The sizes of the TypeScript demo's bench, with no bytes at all for the cost of the boundary alone.
//
//nolint:gochecknoglobals // Read-only, and shared by every benchmark
var sizes = []struct {
	name   string
	length int
}{
	{"0", 0},
	{"64", 64},
	{"1Ki", 1 << 10},
	{"3Ki", 3 << 10},
	{"4Ki", 4 << 10},
	{"64Ki", 64 << 10},
	{"1Mi", 1 << 20},
	{"16Mi", 16 << 20},
}

//nolint:gochecknoglobals // Read-only, and shared by every benchmark
var engines = []struct {
	name   string
	config func() wazero.RuntimeConfig
}{
	{"compiler", wazero.NewRuntimeConfigCompiler},
	{"interpreter", wazero.NewRuntimeConfigInterpreter},
}

func benchModule(b *testing.B, config wazero.RuntimeConfig) *blake3.Module {
	b.Helper()

	module, err := blake3.Compile(b.Context(), config)
	if err != nil {
		b.Fatal(err)
	}

	b.Cleanup(func() { _ = module.Close(context.Background()) })

	return module
}

func benchHasher(b *testing.B, config wazero.RuntimeConfig) *blake3.Hasher {
	b.Helper()

	hasher, err := benchModule(b, config).NewHasher(b.Context())
	if err != nil {
		b.Fatal(err)
	}

	return hasher
}

// BenchmarkWarm is time per call once everything is loaded: zeebo/blake3 in Go, against the crate through wazero.
func BenchmarkWarm(b *testing.B) {
	for _, size := range sizes {
		data := input(size.length, 251)

		b.Run(size.name+"/go", func(b *testing.B) {
			b.SetBytes(int64(size.length))

			for b.Loop() {
				_ = zeebo.Sum256(data)
			}
		})

		for _, engine := range engines {
			b.Run(size.name+"/wasm-"+engine.name, func(b *testing.B) {
				hasher := benchHasher(b, engine.config())
				// Grows its memory once, outside the timing
				_, _ = hasher.Hash(b.Context(), data)

				b.SetBytes(int64(size.length))

				for b.Loop() {
					_, err := hasher.Hash(b.Context(), data)
					if err != nil {
						b.Fatal(err)
					}
				}
			})
		}
	}
}

// BenchmarkInstantiate is a new Hasher from a compiled Module, as each goroutine needs one.
func BenchmarkInstantiate(b *testing.B) {
	module := benchModule(b, wazero.NewRuntimeConfigCompiler())

	for b.Loop() {
		hasher, err := module.NewHasher(b.Context())
		if err != nil {
			b.Fatal(err)
		}

		_ = hasher.Close(b.Context())
	}
}

// BenchmarkCold is compiling, instantiating and a first hash of 64 bytes, as a process would on startup: with nothing
// cached, and with wazero's compilation cache on disk from an earlier run.
func BenchmarkCold(b *testing.B) {
	data := input(64, 251)

	for _, engine := range engines {
		b.Run(engine.name, func(b *testing.B) {
			for b.Loop() {
				coldHash(b, engine.config(), data)
			}
		})
	}

	b.Run("compiler-cached", func(b *testing.B) {
		dir := b.TempDir()

		// Fills the cache on disk, as an earlier run of the process would have
		coldHash(b, cachedConfig(b, dir), data)

		for b.Loop() {
			coldHash(b, cachedConfig(b, dir), data)
		}
	})
}

// cachedConfig compiles with a new compilation cache on dir, so only the disk is shared with earlier runs.
//
//nolint:ireturn // wazero's configs are interfaces
func cachedConfig(b *testing.B, dir string) wazero.RuntimeConfig {
	b.Helper()

	cache, err := wazero.NewCompilationCacheWithDir(dir)
	if err != nil {
		b.Fatal(err)
	}

	return wazero.NewRuntimeConfigCompiler().WithCompilationCache(cache)
}

func coldHash(b *testing.B, config wazero.RuntimeConfig, data []byte) {
	b.Helper()

	ctx := b.Context()

	module, err := blake3.Compile(ctx, config)
	if err != nil {
		b.Fatal(err)
	}

	hasher, err := module.NewHasher(ctx)
	if err != nil {
		b.Fatal(err)
	}

	_, err = hasher.Hash(ctx, data)
	if err != nil {
		b.Fatal(err)
	}

	err = module.Close(ctx)
	if err != nil {
		b.Fatal(fmt.Errorf("closing: %w", err))
	}
}
