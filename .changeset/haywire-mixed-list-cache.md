---
"haywire": patch
---

Fix an async list request failing with a raw `TypeError` when one element is async and another was already created synchronously (an eager singleton, a `withInstance()` or `bindInstance()` element, or a singleton first created for a dependent). Each element of a list is now created on its own sync or async path.
