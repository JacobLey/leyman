// Package consistenthash maps keys to buckets in constant time, with no loops.
//
// It implements the specification of the constant-consistent-hash npm package, and returns the same buckets:
// https://github.com/JacobLey/leyman/blob/main/tools/constant-consistent-hash/constant-consistent-hash/SPEC.md
package consistenthash

import (
	"errors"
	"fmt"
	"math"
	"math/bits"
)

// MaxBuckets is the largest number of buckets, as the key's hash provides 48 bits for selecting blocks.
const MaxBuckets = 1 << 48

// ErrBuckets is returned when the number of buckets is out of bounds.
var ErrBuckets = errors.New("buckets must be between 1 and 2^48")

// Salts distinguish the random values drawn for the same block.
const (
	saltTop uint32 = iota
	saltPair
	saltSecond
)

// mix32 is the lowbias32 integer hash of a seed offset by an index.
func mix32(seed, index uint32) uint32 {
	x := seed + (index+1)*0x9e3779b9
	x ^= x >> 16
	x *= 0x7feb352d
	x ^= x >> 15
	x *= 0x846ca68b
	x ^= x >> 16
	return x
}

// lanes is the hash of a key.
type lanes struct {
	a, b uint32
}

// hashKey hashes the bytes of a key (two 32 bit lanes, as in cyrb53).
func hashKey(key string, seed uint32) lanes {
	h1 := 0xdeadbeef ^ seed
	h2 := 0x41c6ce57 ^ seed
	for i := range len(key) {
		b := uint32(key[i])
		h1 = (h1 ^ b) * 2654435761
		h2 = (h2 ^ b) * 1597334677
	}

	h1 = (h1 ^ (h1 >> 16)) * 2246822507
	h1 ^= (h2 ^ (h2 >> 13)) * 3266489909
	h2 = (h2 ^ (h2 >> 16)) * 2246822507
	h2 ^= (h1 ^ (h1 >> 13)) * 3266489909
	return lanes{a: h1, b: mix32(h2, uint32(len(key)))}
}

// random is the 64 bit random value for a block and salt.
func (l lanes) random(block int, salt uint32) uint64 {
	index := uint32(block)*3 + salt
	return uint64(mix32(l.b, index))<<32 | uint64(mix32(l.a, index))
}

// uniform is a value in [0, 1) from the top 53 bits of the random value, which is exact in a float64.
func (l lanes) uniform(block int, salt uint32) float64 {
	return float64(l.random(block, salt)>>11) / (1 << 53)
}

// f is the bucket in [0, 2^power) when the number of buckets is a power of 2.
func (l lanes) f(power int) uint64 {
	selection := uint64(l.b>>16)<<32 | uint64(l.a)
	k := selection & (1<<power - 1)
	if k == 0 {
		return 0
	}
	block := bits.Len64(k) - 1
	// Shifting a uint64 by 64 is 0 in Go, which is the offset within block 0
	return 1<<block + l.random(block, saltTop)>>(64-block)
}

// Bucket maps a key to a bucket in [0, buckets), in constant time.
//
// Every bucket is equally likely. When buckets grows by one, a key either keeps
// its bucket, or moves to the new bucket (buckets - 1), so only 1/buckets of keys move.
//
// The key is hashed as its bytes, so give it as UTF-8 to match other languages.
// The seed selects an independent hash function, use 0 by default.
func Bucket(key string, buckets uint64, seed uint32) (uint64, error) {
	if buckets < 1 || buckets > MaxBuckets {
		return 0, fmt.Errorf("%w, received %d", ErrBuckets, buckets)
	}

	l := hashKey(key, seed)
	power := bits.Len64(buckets - 1)
	top := l.f(power)
	if top < buckets {
		return top, nil
	}

	// The top block [h, 2h) holds `top`, the highest bucket the key lands on, which is out of range.
	// It holds a second bucket with probability 2h(top - h) / top(top + 1), uniform in [h, top).
	block := power - 1
	h := uint64(1) << block

	// Explicit float64 conversions round each product, as Go may otherwise fuse floating point operations
	pair := float64(float64(l.uniform(block, saltPair)*float64(top)) * float64(top+1))
	if pair < 2*float64(h)*float64(top-h) {
		second := h + uint64(math.Floor(float64(l.uniform(block, saltSecond)*float64(top-h))))
		if second < buckets {
			return second, nil
		}
	}

	// Nothing in the top block is in range, so fall back to the lower blocks
	return l.f(block), nil
}
