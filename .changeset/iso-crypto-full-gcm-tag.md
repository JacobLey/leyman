---
"iso-crypto": patch
---

In Node.js, GCM `decrypt` only accepts the full 16 byte authentication tag. Node 22 and 24 accepted a truncated 4, 8 or 12 byte tag, so encrypted content shorter than 16 bytes could authenticate as empty data. Such content now rejects with an `OperationError` `DOMException`, as it does in the browser.
