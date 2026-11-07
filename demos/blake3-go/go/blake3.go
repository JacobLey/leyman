// Package blake3 hashes with BLAKE3 from Rust, compiled to WASM and run by wazero, so Go calls Rust without cgo.
//
// A [Module] compiles the WASM once and is safe for concurrent use. Each [Hasher] is one instance of it, with its own
// memory, for one goroutine at a time.
package blake3

import (
	"context"
	"errors"
	"fmt"
	"math"

	blake3wasm "github.com/JacobLey/leyman/demos/blake3-go/rust"
	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
)

// Size is the length of a hash, in bytes.
const Size = 32

// The room reserved for input when a [Hasher] starts, so small inputs never grow it.
const initialCapacity = 1024

// ErrTooLarge is returned for input that WASM's 32-bit memory can't hold.
var ErrTooLarge = errors.New("input is too large for WASM's 32-bit memory")

// Module is the crate, compiled for one wazero runtime. Safe for concurrent use.
type Module struct {
	runtime  wazero.Runtime
	compiled wazero.CompiledModule
}

// Compile compiles the crate's WASM with config, which picks wazero's compiler or interpreter, a compilation cache, and
// a memory limit.
func Compile(ctx context.Context, config wazero.RuntimeConfig) (*Module, error) {
	runtime := wazero.NewRuntimeWithConfig(ctx, config)

	compiled, err := runtime.CompileModule(ctx, blake3wasm.Module)
	if err != nil {
		// Only fails when config has no room for the module, which closing the runtime can't make worse
		_ = runtime.Close(ctx)

		return nil, fmt.Errorf("compiling: %w", err)
	}

	return &Module{runtime: runtime, compiled: compiled}, nil
}

// Close frees the module, and closes every Hasher made from it.
func (m *Module) Close(ctx context.Context) error {
	return m.runtime.Close(ctx) //nolint:wrapcheck // Compile wraps its errors, there is nothing to add here
}

// Hasher is one instance of the module. Not safe for concurrent use: give each goroutine its own.
type Hasher struct {
	instance api.Module
	memory   api.Memory
	alloc    api.Function
	dealloc  api.Function
	hash     api.Function
	// Where the input is written, and how many bytes fit there. Reused across calls, and only grown
	input    uint32
	capacity uint32
	// Where the hash is written
	output uint32
	// Arguments and results of a call. Reused, so a call allocates nothing on the Go side
	stack [3]uint64
}

// NewHasher instantiates the module, with its own memory.
func (m *Module) NewHasher(ctx context.Context) (*Hasher, error) {
	// No name, so a runtime can hold any number of instances
	instance, err := m.runtime.InstantiateModule(ctx, m.compiled, wazero.NewModuleConfig().WithName(""))
	if err != nil {
		return nil, fmt.Errorf("instantiating: %w", err)
	}

	hasher := &Hasher{
		instance: instance,
		memory:   instance.Memory(),
		alloc:    instance.ExportedFunction("alloc"),
		dealloc:  instance.ExportedFunction("dealloc"),
		hash:     instance.ExportedFunction("hash"),
		// Set below, by `alloc`
		input:    0,
		capacity: 0,
		output:   0,
		stack:    [3]uint64{},
	}

	hasher.output, err = hasher.reserve(ctx, Size)
	if err == nil {
		hasher.input, err = hasher.reserve(ctx, initialCapacity)
		hasher.capacity = initialCapacity
	}

	if err != nil {
		_ = instance.Close(ctx)

		return nil, err
	}

	return hasher, nil
}

// Hash is the BLAKE3 hash of data. The bytes are copied into WASM's memory, as WASM can't read Go's.
//
// An error means the instance trapped, most likely out of memory, and the Hasher is no longer usable.
func (h *Hasher) Hash(ctx context.Context, data []byte) ([Size]byte, error) {
	var hash [Size]byte

	if uint64(len(data)) > math.MaxUint32 {
		return hash, ErrTooLarge
	}

	length := uint32(len(data)) //nolint:gosec // Checked against math.MaxUint32 above
	if length > h.capacity {
		err := h.grow(ctx, length)
		if err != nil {
			return hash, err
		}
	}

	// Within memory, as `alloc` reserved it
	h.memory.Write(h.input, data)

	h.stack = [3]uint64{uint64(h.input), uint64(length), uint64(h.output)}

	err := h.hash.CallWithStack(ctx, h.stack[:])
	if err != nil {
		return hash, fmt.Errorf("hashing: %w", err)
	}

	// A view of WASM's memory, so copy it out before anything else can change it
	view, _ := h.memory.Read(h.output, Size)
	copy(hash[:], view)

	return hash, nil
}

// Close frees the instance and its memory.
func (h *Hasher) Close(ctx context.Context) error {
	return h.instance.Close(ctx) //nolint:wrapcheck // NewHasher wraps its errors, there is nothing to add here
}

// grow replaces the room for input with room for length bytes.
func (h *Hasher) grow(ctx context.Context, length uint32) error {
	h.stack = [3]uint64{uint64(h.input), uint64(h.capacity)}

	err := h.dealloc.CallWithStack(ctx, h.stack[:])
	if err != nil {
		return fmt.Errorf("freeing: %w", err)
	}

	h.capacity = 0

	h.input, err = h.reserve(ctx, length)
	if err != nil {
		return err
	}

	h.capacity = length

	return nil
}

// reserve calls `alloc` for length bytes, returning where they start.
func (h *Hasher) reserve(ctx context.Context, length uint32) (uint32, error) {
	h.stack = [3]uint64{uint64(length)}

	err := h.alloc.CallWithStack(ctx, h.stack[:])
	if err != nil {
		return 0, fmt.Errorf("reserving %d bytes: %w", length, err)
	}

	// A WASM pointer is 32 bits, which wazero widens to 64
	return uint32(h.stack[0]), nil //nolint:gosec // Never more than 32 bits
}
