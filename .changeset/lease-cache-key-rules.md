---
"lease-cache": minor
---

Keys and prefixes that break on a cluster are rejected. A key that is empty or starts with `}` has an empty hash tag, so a cluster would put its value, lease and stale value on different nodes, and every script on it would fail with `CROSSSLOT`. `get`, `read` and `invalidate` now reject it with `LeaseCacheKeyError`. A prefix containing `{` would change the tag of every key, so the constructor throws `LeaseCachePrefixError`.
