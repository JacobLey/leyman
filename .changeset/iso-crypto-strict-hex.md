---
"iso-crypto": major
---

`decode` throws a `TypeError` for hex text with characters other than `0-9` and `a-f`, which were silently decoded as `0`. Valid hex, in either case and of odd length, decodes as before.
