---
"iso-crypto": minor
---

Add `hmac` and `verifyHmac`, for signing data with a shared secret and checking a signature in constant time, on both Node.js and the browser. Built on SHA1, SHA256 (default), SHA384 or SHA512. A signature of the wrong length makes `verifyHmac` resolve `false`, so it can check a webhook signature, such as Standard Webhooks' `v1` HMAC-SHA256 of `id.timestamp.body`, without extra length checks.
