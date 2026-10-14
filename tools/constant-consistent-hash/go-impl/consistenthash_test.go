package consistenthash

import (
	"encoding/json"
	"errors"
	"fmt"
	"testing"

	testvectors "github.com/JacobLey/leyman/tools/constant-consistent-hash/test-vectors"
)

type testVectors struct {
	Ranges  []uint64 `json:"ranges"`
	Vectors []struct {
		Description string    `json:"description"`
		Key         string    `json:"key"`
		Seed        uint32    `json:"seed"`
		Hash        [2]uint32 `json:"hash"`
		Buckets     []uint64  `json:"buckets"`
	} `json:"vectors"`
}

var keys = func() []string {
	keys := make([]string, 1000)
	for i := range keys {
		keys[i] = fmt.Sprintf("00000000-0000-4000-8000-%012x", i)
	}
	return keys
}()

func mustBucket(t *testing.T, key string, buckets uint64, seed uint32) uint64 {
	t.Helper()
	bucket, err := Bucket(key, buckets, seed)
	if err != nil {
		t.Fatal(err)
	}
	return bucket
}

// countMoved is the number of keys that changed bucket when buckets grew by one,
// and how many of them moved somewhere other than the new bucket.
func countMoved(t *testing.T, from uint64, seed uint32) (moved, disrupted int) {
	t.Helper()
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
	// Shared with every implementation
	var vectors testVectors
	if err := json.Unmarshal(testvectors.JSON, &vectors); err != nil {
		t.Fatal(err)
	}
	if len(vectors.Vectors) == 0 {
		t.Fatal("no test vectors")
	}

	for _, vector := range vectors.Vectors {
		t.Run(vector.Description, func(t *testing.T) {
			if got := HashKey(vector.Key, vector.Seed); got != vector.Hash {
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
	for _, buckets := range []uint64{1, 2, 7, 100, 1<<32 + 1, MaxBuckets} {
		for _, key := range keys {
			if got := mustBucket(t, key, buckets, 0); got >= buckets {
				t.Fatalf("Bucket(%q, %d, 0) = %d, out of range", key, buckets, got)
			}
		}
	}
}

func TestBalancesKeysAcrossBuckets(t *testing.T) {
	const buckets = 7
	const total = 70_000
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
	froms := []uint64{1<<32 - 1, 1 << 32, MaxBuckets - 1}
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
	// Expect 100, standard deviation ~9.5
	if moved, _ := countMoved(t, 9, 0); moved < 70 || moved > 130 {
		t.Errorf("moved %d keys growing from 9 to 10", moved)
	}
}

func TestMovesAlmostNoKeysWhenLargeRangeGrows(t *testing.T) {
	// Each block boundary where positions switch from one random word to two
	for _, from := range []uint64{1 << 31, 1 << 32, 1<<32 + 1<<31, 1 << 33, 1 << 47, MaxBuckets - 1} {
		// Expect 1000/from keys to move, so about 0
		if moved, _ := countMoved(t, from, 0); moved != 0 {
			t.Errorf("moved %d keys growing from %d", moved, from)
		}
	}
}

func TestSeedSelectsIndependentHash(t *testing.T) {
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
	for _, buckets := range []uint64{0, MaxBuckets + 1} {
		if _, err := Bucket("key", buckets, 0); !errors.Is(err, ErrBuckets) {
			t.Errorf("Bucket(\"key\", %d, 0) returned error %v, want ErrBuckets", buckets, err)
		}
	}
}
