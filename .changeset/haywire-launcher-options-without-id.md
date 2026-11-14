---
"haywire-launcher": patch
---

Accept options without an id, as `launch(container, undefined, { dispose: true })`, for a container that binds `EntryScript`. It ran, but didn't compile.
