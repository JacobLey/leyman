package idempotencykeys

import (
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	stdhash "hash"
	"io"
	"maps"
	"math"
	"net/http"
	"slices"
	"strings"
)

// IdentityInput is what identifies a key: the caller, the operation, and the key it sent.
type IdentityInput struct {
	// Operation is which operation the request is for, e.g. an OpenAPI operationId: with one, the same key on another
	// operation is another key. Nil for none, where a key is one key across everything the scope calls. An empty one
	// hashes differently from none, though [Keys.Begin] never gives one.
	Operation *string
	// Scope is who is calling: a user or tenant id, so one caller's key never touches another's.
	Scope string
	// Key is the key the request sent.
	Key string
}

// FingerprintInput is what a reused key must match.
type FingerprintInput struct {
	// Headers are the request's headers. Names are matched in any case, and a name's values are joined by ", " in
	// order. Values are hashed as the bytes received.
	Headers http.Header
	// Method is as received. DELETE, GET, HEAD, OPTIONS, POST and PUT are upper-cased in any case, as fetch does;
	// other methods are case-sensitive.
	Method string
	// Target is the path and query, as [RequestTarget] gives them.
	Target string
	// Named are the names of the headers that are part of the fingerprint, in any case and order.
	Named []string
	// Body is the raw body, empty for a request without one.
	Body []byte
}

// The length of an absent field, so an absent value never hashes like an empty one.
const absentField = math.MaxUint32

// fieldHash builds one of the spec's hashes: each field is its length in bytes as a 32-bit big-endian unsigned
// integer, then its bytes.
type fieldHash struct {
	stdhash.Hash
}

func (h fieldHash) uint32(value uint32) {
	_, _ = h.Write(binary.BigEndian.AppendUint32(nil, value))
}

func (h fieldHash) field(value string) {
	h.uint32(uint32(len(value))) //nolint:gosec // A request part is never 4 GiB, as no server buffers one
	_, _ = io.WriteString(h, value)
}

func (h fieldHash) optional(value *string) {
	if value == nil {
		h.uint32(absentField)
	} else {
		h.field(*value)
	}
}

func (h fieldHash) hex() string {
	return hex.EncodeToString(h.Sum(nil))
}

// ComputeIdentity hashes a key's identity, as the spec's identity: 64 lower-case hex characters.
func ComputeIdentity(input IdentityInput) string {
	hash := fieldHash{sha256.New()}
	hash.field(input.Scope)
	hash.optional(input.Operation)
	hash.field(input.Key)

	return hash.hex()
}

// ComputeFingerprint hashes a request's fingerprint, as the spec's fingerprint: 64 lower-case hex characters.
func ComputeFingerprint(input FingerprintInput) string {
	names := make([]string, 0, len(input.Named))
	for _, name := range input.Named {
		names = append(names, strings.ToLower(name))
	}
	// In byte order, as strings compare
	slices.Sort(names)
	names = slices.Compact(names)

	// Keys are sorted, so a name given in two cases (only in a hand-built Header) joins its values the same every time
	keys := slices.Sorted(maps.Keys(input.Headers))

	hash := fieldHash{sha256.New()}
	hash.field(normalizeMethod(input.Method))
	hash.field(input.Target)
	hash.uint32(uint32(len(names))) //nolint:gosec // Fewer names than memory holds

	for _, name := range names {
		var values []string

		for _, key := range keys {
			if strings.ToLower(key) == name {
				values = append(values, input.Headers[key]...)
			}
		}

		hash.field(name)

		if values == nil {
			hash.optional(nil)
		} else {
			hash.field(strings.Join(values, ", "))
		}
	}

	hash.field(string(input.Body))

	return hash.hex()
}

// normalizeMethod upper-cases the methods fetch upper-cases in any case when it builds a Request. Other methods are
// case-sensitive, as in HTTP. https://fetch.spec.whatwg.org/#concept-method-normalize
func normalizeMethod(method string) string {
	switch upper := strings.ToUpper(method); upper {
	case http.MethodDelete, http.MethodGet, http.MethodHead, http.MethodOptions, http.MethodPost, http.MethodPut:
		return upper
	default:
		return method
	}
}
