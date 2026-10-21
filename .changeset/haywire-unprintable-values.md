---
"haywire": patch
---

An error whose message names a value no longer throws while building that message. A plain object with a circular reference or a BigInt returned for a class id used to throw a `TypeError` from `JSON.stringify` instead of `HaywireInstanceOfResponseError`, and is now described by its type. A `HaywireMultiError` of raw provider errors (`unsafeRawProviderErrors`) that can't be converted to a string, like `Object.create(null)`, is described the same way.
