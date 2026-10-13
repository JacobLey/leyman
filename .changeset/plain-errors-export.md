---
"haywire": minor
---

Export every error class, not only the abstract bases, so their properties are typed: for example `requestPath` on `HaywireNullResponseError`, or `dependentIds` on `HaywireProviderMissingError`.
