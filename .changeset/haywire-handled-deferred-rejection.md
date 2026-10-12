---
"haywire": patch
---

When a deferred dependency fails, the promise passed to the provider no longer causes an unhandled rejection. The request still rejects with the error, and handlers the provider attaches to the promise still run.
