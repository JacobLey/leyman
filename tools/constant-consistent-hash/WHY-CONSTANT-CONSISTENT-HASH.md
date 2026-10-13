# Why constant-consistent-hash?

Back to the [README](https://www.npmjs.com/package/constant-consistent-hash).

## Contents
- [The problem](#the-problem)
- [How it works](#how-it-works)
- [Why it is correct](#why-it-is-correct)
- [Hashing the key](#hashing-the-key)
- [Compared to alternatives](#compared-to-alternatives)
- [Non-goals](#non-goals)

## The problem

Spreading keys across `n` buckets (shards, cache nodes, partitions, workers) with `hash(key) % n` balances well, but changing `n` moves almost every key. Going from 4 to 5 buckets keeps only 1 key in 5 where it was, and every move is data to copy or a cache to warm.

A consistent hash keeps buckets balanced while moving as few keys as possible. Growing from `n` to `n + 1` buckets, the new bucket needs `1/(n + 1)` of the keys, so the best possible hash moves exactly that many, all of them into the new bucket, and leaves every other key alone.

[Jump consistent hash](https://arxiv.org/abs/1406.2294) (Lamping and Veach, 2014) achieves that without any stored state, but it loops once per "jump" a key makes as the bucket count grows, which is O(log n) per lookup. [Power consistent hashing](https://arxiv.org/abs/2307.12448) (Leu, 2023) and [JumpBackHash](https://arxiv.org/abs/2403.18682) (Ertl, 2024) bring that down to constant time *on average*, but still loop, a number of times that depends on the key.

This package does the same with a fixed amount of work per lookup, and no loops.

## How it works

Think of each key growing with the bucket count: when the count goes from `n` to `n + 1`, a key either stays, or moves to the new bucket `n` with probability `1/(n + 1)`. The set of buckets a key moves to is its *jumps*.

### Power of 2 blocks

Split buckets into blocks `[1, 2)`, `[2, 4)`, `[4, 8)`, ..., `[h, 2h)`. The chance a key has no jump within block `[h, 2h)` is

```
h/(h+1) × (h+1)/(h+2) × ... × (2h-1)/(2h) = 1/2
```

so whether each block holds a jump is one fair coin flip, independent per block. One random number supplies all of them: its highest set bit (below `m`) is the highest block with a jump. Within that block, the last jump is uniform. That gives `f(key, m)`: the key's bucket when the count is a power of 2, `m`, in constant time. It stays put as `m` doubles, unless the new block holds a jump.

Power consistent hashing uses the same `f`.

### Between powers of 2

When the count `n` is not a power of 2, let `m` be the next power of 2 and `h = m/2`. If `f(key, m) < n` it is the answer (the last jump below `m` is already a bucket that exists). Otherwise, the answer is the last jump in the top block `[h, n)`, or, if there is none, `f(key, h)`.

Jump and Power consistent hashing find that last jump by generating the jumps one by one with independent coins per bucket. A block can hold any number of jumps, hence the loop.

The insight here is that balance and minimal disruption do not need independent coins. They only constrain *consecutive* jumps (see [below](#why-it-is-correct)), and a block never needs more than 2 jumps to satisfy them. Given the block's last jump `M`, uniform in `[h, 2h)`:

- the block has a second jump with probability `2h(M - h) / (M(M + 1))`,
- and that jump is uniform in `[h, M)`.

So a lookup is:

```
m = smallest power of 2 >= n,  h = m/2

top = f(key, m)
if top < n:                        return top
if the top block has a second jump, and it is < n:
                                   return the second jump
                                   return f(key, h)
```

At most 2 calls to `f` and 2 extra random values.

## Why it is correct

Take the block `[h, 2h)`. Let `S` be the jumps a key makes in it, and `L` its bucket when the count is `h`, uniform in `[0, h)` and independent of `S`. With `n` buckets (`h ≤ n ≤ 2h`), the key is in the last jump of `S` below `n`, or `L` if there is none.

For every `n` to be balanced, and growing it to only move keys to the new bucket, exactly two things must hold for every `n` in `[h, 2h]`:

1. `P(no jump in [h, n)) = h/n`, so each bucket in `[0, h)` gets `1/n` of keys via `L`.
2. `P(i is a jump and nothing is in (i, n)) = 1/n` for each `i` in `[h, n)`, so bucket `i` gets `1/n` of keys.

Minimal disruption is built in, as a key's bucket only changes when the count passes one of its jumps, and it moves to that jump, which is the new bucket.

With the construction above, writing `q(M) = 2h(M - h) / (M(M + 1))` for the chance of a second jump:

- `S` is empty with probability `1/2`, and otherwise `M = max S` is uniform, so `P(max S = M) = 1/(2h)`.
- `P(S = {i, M}) = 1/(2h) × q(M) / (M - h) = 1/(M(M + 1))` for `h ≤ i < M`.
- `P(min S = i) = P(S = {i}) + Σ P(S = {i, M}) = (1 - q(i))/(2h) + 1/(i + 1) - 1/(2h) = h/(i(i + 1))`.

Then:

1. `P(no jump in [h, n)) = P(S empty) + Σ_{i ≥ n} P(min S = i) = 1/2 + h(1/n - 1/(2h)) = h/n` ✓
2. Bucket `i` holds the key when `i` is the last jump (any second jump is below it), or `i` is the first of two jumps and the second is `≥ n`: `1/(2h) + Σ_{M ≥ n} 1/(M(M + 1)) = 1/(2h) + 1/n - 1/(2h) = 1/n` ✓

`q(M)` is a valid probability, since `M(M + 1) - 2h(M - h) = (M - h)² + h² + M > 0`.

At `n = 2h` the key is in `max S`, or `L`, which is exactly `f(key, 2h)`, the starting point of the next block. So the blocks chain together.

The package's tests check this directly: across every count from 1 to 200 (and near 2^32 and 2^48), no key ever moves anywhere but the new bucket, and buckets pass a chi-square test for uniformity.

## Hashing the key

The algorithm needs a few independent random values per key. They come from one pass over the key's UTF-8 bytes, with two 32-bit multiply/xor lanes (as in [cyrb53](https://github.com/bryc/code/blob/master/jshash/experimental/cyrb53.js)), expanded with the [lowbias32](https://github.com/skeeto/hash-prospector) integer hash.

- **Not cryptographic**, as keys are expected to be self-generated (e.g. UUIDs), so speed matters more than resisting crafted keys. A cryptographic hash such as SHA-1 is several times slower, and does not stop an attacker who can find colliding keys offline anyway.
- **UTF-8 bytes**, rather than JavaScript's UTF-16 code units, so any language can hash the same input.
- **32-bit integer operations, and IEEE-754 doubles only where results are exact or rounded once**, so every language produces the same bucket. See [SPEC.md](https://github.com/JacobLey/leyman/blob/main/tools/constant-consistent-hash/SPEC.md).

## Compared to alternatives

| | Lookup | Memory | Keys moved adding a bucket | Removes any bucket |
|---|---|---|---|---|
| **constant-consistent-hash** | O(1), no loops | none | minimal | ❌ |
| Modulo (`hash % n`) | O(1) | none | almost all | ❌ |
| [Hash ring](https://en.wikipedia.org/wiki/Consistent_hashing) (Karger et al., Ketama) | O(log n) | ring of virtual nodes | ~minimal, balance depends on virtual node count | ✅ |
| [Rendezvous / HRW](https://en.wikipedia.org/wiki/Rendezvous_hashing) | O(n) | list of nodes | minimal | ✅ |
| [Maglev](https://research.google/pubs/maglev-a-fast-and-reliable-software-network-load-balancer/) | O(1) | lookup table | near minimal | ✅ |
| [Jump hash](https://arxiv.org/abs/1406.2294) | O(log n) | none | minimal | ❌ |
| [Power consistent hashing](https://arxiv.org/abs/2307.12448) | O(1) on average | none | minimal | ❌ |
| [JumpBackHash](https://arxiv.org/abs/2403.18682) | O(1) on average | none | minimal | ❌ |
| [AnchorHash](https://arxiv.org/abs/1812.09674), [MementoHash](https://arxiv.org/abs/2306.09783) | O(1) on average, more with many removals | state per removed bucket | minimal | ✅ |

- **Hash rings and rendezvous** suit clusters where any node can fail and leave. They need the list of nodes, and rings need many virtual nodes per node to balance well.
- **Jump, Power and JumpBackHash** share this package's model (buckets numbered `0` to `n - 1`, added and removed at the end). They map keys to different buckets than this package, so they cannot be swapped in for each other on existing data.
- **AnchorHash and MementoHash** add arbitrary removals to that model, at the cost of tracking the removed buckets.

## Non-goals

- **Removing buckets from the middle.** Keep the count, and redirect the removed bucket's number in your own code, or use a hash ring, rendezvous or AnchorHash.
- **Weighted buckets.** Every bucket gets an equal share. Give a larger node several bucket numbers instead.
- **Keys chosen by an attacker.** The key hash is fast, not cryptographic. The `seed` option selects independent hash functions for layering, it is not a secret key.
