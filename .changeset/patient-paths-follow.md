---
"haywire": minor
---

Errors for a provider's invalid value (`null` or `undefined` where the id doesn't allow it, the wrong class, or a `list('multi')` provider not returning an array) name the path from the requested id: `Null value returned for non-nullable provider: Config (requested via App -> Repo(supplier(sync)) -> Config)`.
