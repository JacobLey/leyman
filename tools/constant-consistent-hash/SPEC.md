# constant-consistent-hash specification

Back to the [README](https://www.npmjs.com/package/constant-consistent-hash).

This describes `consistentHash(key, range, { seed })` precisely enough for any language to return the same buckets as the JavaScript implementation. For why the algorithm works, see [WHY-CONSTANT-CONSISTENT-HASH.md](https://github.com/JacobLey/leyman/blob/main/tools/constant-consistent-hash/WHY-CONSTANT-CONSISTENT-HASH.md).

## Conventions

- **u32**: unsigned 32-bit integer. Every u32 operation wraps modulo 2^32.
- `imul(a, b)`: low 32 bits of `a × b`.
- `>>>`: logical (unsigned) right shift. `^`, `&`, `|`: bitwise xor, and, or.
- **f64**: IEEE-754 binary64 with round-to-nearest-even. Only used in the two marked steps below, evaluated in exactly the order written. No expression has the shape `a × b + c`, so fused multiply-add contraction does not change results, but do not enable "fast math" style reassociation.
- Integers up to 2^53 (bucket numbers, `range`) are exact in f64 or a 64-bit integer.

## Inputs

| Input | Description |
|---|---|
| `key` | Unicode string, hashed as its UTF-8 bytes. Lone surrogates (only possible in UTF-16 strings) are encoded as U+FFFD (`EF BF BD`). |
| `range` | Integer, `1 ≤ range ≤ 2^48`. |
| `seed` | u32, default `0`. |

Implementations should reject a `range` or `seed` out of bounds.

## Steps

### `mix32(seed, index)` → u32

```
x = seed + imul(index + 1, 0x9e3779b9)
x = x ^ (x >>> 16)
x = imul(x, 0x7feb352d)
x = x ^ (x >>> 15)
x = imul(x, 0x846ca68b)
x = x ^ (x >>> 16)
return x
```

### `hashKey(bytes, seed)` → `w[0..4]`, five u32

```
h1 = 0xdeadbeef ^ seed
h2 = 0x41c6ce57 ^ seed
for each byte b of bytes:
    h1 = imul(h1 ^ b, 2654435761)
    h2 = imul(h2 ^ b, 1597334677)

h1 = imul(h1 ^ (h1 >>> 16), 2246822507)
h1 = h1 ^ imul(h2 ^ (h2 >>> 13), 3266489909)
h2 = imul(h2 ^ (h2 >>> 16), 2246822507)
h2 = h2 ^ imul(h1 ^ (h1 >>> 13), 3266489909)

lane = mix32(h2, length of bytes)
w[i] = mix32(h1 ^ mix32(lane, i), i)    for i = 0..4
```

### `random53(seed, block, salt)` → 53-bit integer

`salt` is `0` (top), `1` (pair) or `2` (second).

```
index = block × 6 + salt × 2
hi = mix32(seed, index)
lo = mix32(seed, index + 1)
return hi × 2^21 + (lo >>> 11)
```

`uniform(seed, block, salt)` is `random53(seed, block, salt) / 2^53`, which is exact in f64.

### `bitLength(x)`

Number of bits needed to represent `x`: `0` for `0`, otherwise one more than the index of the highest set bit.

### `f(w, m)` → integer in `[0, m)`, for a power of 2 `m ≤ 2^48`

```
bits = (w[0] & 0xffff) × 2^32 + w[1]          48-bit integer
k = bits mod m                                 the low log2(m) bits
if k = 0: return 0
j = bitLength(k) - 1
return 2^j + (random53(w[2], j, 0) >> (53 - j))
```

`random53(...) >> (53 - j)` is the top `j` bits, the same as `floor(uniform(w[2], j, 0) × 2^j)`.

### `consistentHash(key, range, seed)`

```
w = hashKey(UTF-8 bytes of key, seed)
p = bitLength(range - 1)
m = 2^p

top = f(w, m)
if top < range: return top

j = p - 1
h = 2^j

[f64]  if (uniform(w[3], j, 1) × top) × (top + 1) < 2h × (top - h):
[f64]      second = h + floor(uniform(w[4], j, 2) × (top - h))
           if second < range: return second

return f(w, h)
```

In the first f64 step, the left side is rounded twice, after each multiplication, and the right side is exact. In the second, `uniform × (top - h)` is rounded once before `floor`.

## Test vectors

`consistentHash(key, range, { seed })`:

| key | seed | 1 | 2 | 7 | 100 | 2^32 + 1 | 2^48 |
|---|---|---|---|---|---|---|---|
| `""` | 0 | 0 | 0 | 5 | 40 | 1032688306 | 274793043325099 |
| `"a"` | 0 | 0 | 0 | 0 | 33 | 2312967350 | 47323351833859 |
| `"00000000-0000-4000-8000-000000000000"` | 0 | 0 | 1 | 6 | 28 | 112258478 | 181633977207240 |
| `"héllo 🌍"` | 0 | 0 | 0 | 0 | 17 | 1733140221 | 200283044854715 |
| `"߿"` (2 bytes) | 0 | 0 | 1 | 2 | 37 | 1981301467 | 179045220803231 |
| `"￿"` (3 bytes) | 0 | 0 | 1 | 1 | 17 | 3841734732 | 156173929975538 |
| `"\u{10FFFF}"` (4 bytes) | 0 | 0 | 1 | 5 | 50 | 3118155352 | 165607780543953 |
| `"00000000-0000-4000-8000-000000000000"` | 1 | 0 | 0 | 4 | 74 | 1283474075 | 207493669313094 |
| `"00000000-0000-4000-8000-000000000000"` | 4294967295 | 0 | 1 | 2 | 9 | 2973883913 | 43496619248832 |

A complete implementation should also pass the package's property tests: for many keys, growing `range` by one never moves a key anywhere but the new bucket `range`.
