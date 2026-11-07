package blake3_test

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"testing"

	blake3 "github.com/JacobLey/leyman/demos/blake3-go/go"
	blake3wasm "github.com/JacobLey/leyman/demos/blake3-go/rust"
	"github.com/tetratelabs/wazero"
)

type testVectors struct {
	InputByteCycle int `json:"inputByteCycle"`
	Cases          []struct {
		InputLength int    `json:"inputLength"`
		Hash        string `json:"hash"`
	} `json:"cases"`
}

// input is the bytes of a test vector, which repeat 0 to cycle - 1.
func input(length, cycle int) []byte {
	bytes := make([]byte, length)
	for i := range bytes {
		bytes[i] = byte(i % cycle) //nolint:gosec // The test vectors' cycle is 251, which fits
	}

	return bytes
}

func mustCompile(t *testing.T, config wazero.RuntimeConfig) *blake3.Module {
	t.Helper()

	module, err := blake3.Compile(t.Context(), config)
	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() { _ = module.Close(context.Background()) })

	return module
}

func mustHasher(t *testing.T, module *blake3.Module) *blake3.Hasher {
	t.Helper()

	hasher, err := module.NewHasher(t.Context())
	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() { _ = hasher.Close(context.Background()) })

	return hasher
}

func TestTestVectors(t *testing.T) {
	t.Parallel()

	var vectors testVectors

	err := json.Unmarshal(blake3wasm.TestVectors, &vectors)
	if err != nil {
		t.Fatal(err)
	}

	if len(vectors.Cases) == 0 {
		t.Fatal("no test vectors")
	}

	for name, config := range map[string]wazero.RuntimeConfig{
		"compiler":    wazero.NewRuntimeConfigCompiler(),
		"interpreter": wazero.NewRuntimeConfigInterpreter(),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			// One hasher for every case, so its input grows (the largest is 100 KiB) and is reused
			hasher := mustHasher(t, mustCompile(t, config))

			for _, testCase := range vectors.Cases {
				hash, err := hasher.Hash(t.Context(), input(testCase.InputLength, vectors.InputByteCycle))
				if err != nil {
					t.Fatal(err)
				}

				if actual := hex.EncodeToString(hash[:]); actual != testCase.Hash {
					t.Errorf("%d bytes: got %s, want %s", testCase.InputLength, actual, testCase.Hash)
				}
			}
		})
	}
}

func TestHashersAreIndependent(t *testing.T) {
	t.Parallel()

	module := mustCompile(t, wazero.NewRuntimeConfig())
	first, second := mustHasher(t, module), mustHasher(t, module)

	// The second's memory is untouched by the first's
	_, err := first.Hash(t.Context(), input(4096, 251))
	if err != nil {
		t.Fatal(err)
	}

	empty, err := second.Hash(t.Context(), nil)
	if err != nil {
		t.Fatal(err)
	}

	if actual := hex.EncodeToString(empty[:]); actual != "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262" {
		t.Errorf("got %s", actual)
	}
}

func TestCompileFailsWithoutRoomForMemory(t *testing.T) {
	t.Parallel()

	_, err := blake3.Compile(t.Context(), wazero.NewRuntimeConfig().WithMemoryLimitPages(1))
	if err == nil {
		t.Fatal("expected an error")
	}
}

func TestNewHasherFailsOnClosedModule(t *testing.T) {
	t.Parallel()

	module := mustCompile(t, wazero.NewRuntimeConfig())

	err := module.Close(t.Context())
	if err != nil {
		t.Fatal(err)
	}

	_, err = module.NewHasher(t.Context())
	if err == nil {
		t.Fatal("expected an error")
	}
}

func TestNewHasherFailsWhenCancelled(t *testing.T) {
	t.Parallel()

	module := mustCompile(t, wazero.NewRuntimeConfig().WithCloseOnContextDone(true))

	ctx, cancel := context.WithCancel(t.Context())
	cancel()

	_, err := module.NewHasher(ctx)
	if err == nil {
		t.Fatal("expected an error")
	}
}

func TestHashFailsWhenCancelled(t *testing.T) {
	t.Parallel()

	for name, length := range map[string]int{"within capacity": 64, "growing": 4096} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			hasher := mustHasher(t, mustCompile(t, wazero.NewRuntimeConfig().WithCloseOnContextDone(true)))

			ctx, cancel := context.WithCancel(t.Context())
			cancel()

			_, err := hasher.Hash(ctx, input(length, 251))
			if err == nil {
				t.Fatal("expected an error")
			}
		})
	}
}

func TestHashFailsOutOfMemory(t *testing.T) {
	t.Parallel()

	// 64 KiB pages, so 4 MiB
	hasher := mustHasher(t, mustCompile(t, wazero.NewRuntimeConfig().WithMemoryLimitPages(64)))

	_, err := hasher.Hash(t.Context(), make([]byte, 8<<20))
	if err == nil {
		t.Fatal("expected an error")
	}
}

func TestHashRejectsMoreThan32Bits(t *testing.T) {
	t.Parallel()

	hasher := mustHasher(t, mustCompile(t, wazero.NewRuntimeConfig()))

	// Never written or read, so the operating system never backs it with memory
	_, err := hasher.Hash(t.Context(), make([]byte, 1<<32))
	if !errors.Is(err, blake3.ErrTooLarge) {
		t.Fatalf("got %v", err)
	}
}
