---
"haywire": major
---

Errors thrown by providers are wrapped in a `HaywireProviderError`, which names the path from the requested id to the binding that failed. The original error is its `cause`, unchanged:

```
HaywireProviderError: Provider for DB_URL failed (requested via App -> Database -> DB_URL): DB_URL is missing
```

Code that catches a provider's error by type around `get()` or `getAsync()` must check `err.cause` instead. To keep throwing provider errors as they are, create the container with `createContainer(module, { unsafeRawProviderErrors: true })` (also accepted by `createContainerFactory()`, `module.toContainer()` and `module.toContainerFactory()`).

Errors thrown by Haywire itself, by a value's methods after it is created, and by disposers are not wrapped.
