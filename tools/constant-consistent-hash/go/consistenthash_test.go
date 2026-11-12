package consistenthash_test

import (
	"encoding/json"
	"errors"
	"fmt"
	"testing"

	consistenthash "github.com/JacobLey/leyman/tools/constant-consistent-hash/go"
	testvectors "github.com/JacobLey/leyman/tools/constant-consistent-hash/test-vectors"
)

type testVectors struct {
	SpecVersion string   `json:"specVersion"`
	Ranges      []uint64 `json:"ranges"`
	Vectors     []struct {
		Description string    `json:"description"`
		Key         string    `json:"key"`
		Seed        uint32    `json:"seed"`
		Hash        [2]uint32 `json:"hash"`
		Buckets     []uint64  `json:"buckets"`
	} `json:"vectors"`
}

//nolint:gochecknoglobals // Read-only, and shared by every test
var keys = func() []string {
	keys := make([]string, 1000)
	for i := range keys {
		keys[i] = fmt.Sprintf("00000000-0000-4000-8000-%012x", i)
	}

	return keys
}()

func mustBucket(t *testing.T, key string, buckets uint64, seed uint32) uint64 {
	t.Helper()

	bucket, err := consistenthash.Bucket(key, buckets, seed)
	if err != nil {
		t.Fatal(err)
	}

	return bucket
}

// countMoved is the number of keys that changed bucket when buckets grew by one,
// and how many of them moved somewhere other than the new bucket.
func countMoved(t *testing.T, from uint64, seed uint32) (int, int) {
	t.Helper()

	moved, disrupted := 0, 0

	for _, key := range keys {
		before := mustBucket(t, key, from, seed)

		after := mustBucket(t, key, from+1, seed)
		if before != after {
			moved++

			if after != from {
				disrupted++
			}
		}
	}

	return moved, disrupted
}

func TestMatchesTestVectors(t *testing.T) {
	t.Parallel()

	// Shared with every implementation
	var vectors testVectors
	if err := json.Unmarshal(testvectors.JSON, &vectors); err != nil {
		t.Fatal(err)
	}

	if len(vectors.Vectors) == 0 {
		t.Fatal("no test vectors")
	}

	if consistenthash.SpecVersion != vectors.SpecVersion {
		t.Errorf("SpecVersion = %q, want %q", consistenthash.SpecVersion, vectors.SpecVersion)
	}

	for _, vector := range vectors.Vectors {
		t.Run(vector.Description, func(t *testing.T) {
			t.Parallel()

			if got := consistenthash.HashKey(vector.Key, vector.Seed); got != vector.Hash {
				t.Errorf("HashKey(%q, %d) = %v, want %v", vector.Key, vector.Seed, got, vector.Hash)
			}

			for i, buckets := range vectors.Ranges {
				if got := mustBucket(t, vector.Key, buckets, vector.Seed); got != vector.Buckets[i] {
					t.Errorf("Bucket(%q, %d, %d) = %d, want %d", vector.Key, buckets, vector.Seed, got, vector.Buckets[i])
				}
			}
		})
	}
}

func TestReturnsBucketWithinRange(t *testing.T) {
	t.Parallel()

	for _, buckets := range []uint64{1, 2, 7, 100, 1<<32 + 1, consistenthash.MaxBuckets} {
		for _, key := range keys {
			if got := mustBucket(t, key, buckets, 0); got >= buckets {
				t.Fatalf("Bucket(%q, %d, 0) = %d, out of range", key, buckets, got)
			}
		}
	}
}

func TestBalancesKeysAcrossBuckets(t *testing.T) {
	t.Parallel()

	const (
		buckets = 7
		total   = 70_000
	)

	var counts [buckets]int
	for i := range total {
		counts[mustBucket(t, fmt.Sprintf("key-%d", i), buckets, 0)]++
	}

	expected := float64(total) / buckets

	chiSquare := 0.0
	for _, count := range counts {
		chiSquare += (float64(count) - expected) * (float64(count) - expected) / expected
	}
	// 99.9th percentile of chi-square with 6 degrees of freedom
	if chiSquare >= 22.46 {
		t.Errorf("chi-square %f, counts %v", chiSquare, counts)
	}
}

func TestOnlyMovesKeysToNewBucket(t *testing.T) {
	t.Parallel()

	froms := []uint64{1<<32 - 1, 1 << 32, consistenthash.MaxBuckets - 1}
	for from := uint64(1); from <= 200; from++ {
		froms = append(froms, from)
	}

	for _, seed := range []uint32{0, 123} {
		for _, from := range froms {
			if _, disrupted := countMoved(t, from, seed); disrupted != 0 {
				t.Errorf("growing from %d (seed %d) moved %d keys to an existing bucket", from, seed, disrupted)
			}
		}
	}
}

func TestMovesOneOverRangeOfKeys(t *testing.T) {
	t.Parallel()

	// Expect 100, standard deviation ~9.5
	if moved, _ := countMoved(t, 9, 0); moved < 70 || moved > 130 {
		t.Errorf("moved %d keys growing from 9 to 10", moved)
	}
}

func TestMovesAlmostNoKeysWhenLargeRangeGrows(t *testing.T) {
	t.Parallel()

	// Each block boundary where positions switch from one random word to two
	for _, from := range []uint64{1 << 31, 1 << 32, 1<<32 + 1<<31, 1 << 33, 1 << 47, consistenthash.MaxBuckets - 1} {
		// Expect 1000/from keys to move, so about 0
		if moved, _ := countMoved(t, from, 0); moved != 0 {
			t.Errorf("moved %d keys growing from %d", moved, from)
		}
	}
}

func TestSeedSelectsIndependentHash(t *testing.T) {
	t.Parallel()

	same := 0

	for _, key := range keys {
		if mustBucket(t, key, 100, 0) == mustBucket(t, key, 100, 1) {
			same++
		}
	}
	// Expect 1/100 of keys (10) to match by chance
	if same >= 30 {
		t.Errorf("%d keys matched across seeds", same)
	}
}

func TestRejectsBucketsOutOfBounds(t *testing.T) {
	t.Parallel()

	for _, buckets := range []uint64{0, consistenthash.MaxBuckets + 1} {
		if _, err := consistenthash.Bucket("key", buckets, 0); !errors.Is(err, consistenthash.ErrBuckets) {
			t.Errorf("Bucket(\"key\", %d, 0) returned error %v, want ErrBuckets", buckets, err)
		}
	}
}
