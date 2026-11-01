---
'juniper': patch
---

Serialize a definition once per document however many schemas derive from it, so `user.description('x')` used many times no longer serializes `user` each time.

Fix two comparisons: a schema derived from a definition with `[]` in place of `{}` (e.g. in metadata) now keeps the difference rather than dropping it, and `serializeSpec` accepts an existing `components.schemas` entry equal to a definition whatever its key order, where it threw "has a different schema".
