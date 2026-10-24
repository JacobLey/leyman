---
"lease-cache": patch
---

`get` and `read` accept values typed with interfaces. Loaded values are checked with the new `JsonValue<T>` type, which still rejects a `Date`, a function or `undefined`.
