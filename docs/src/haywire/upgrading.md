---
description: What changed in Haywire 2.0, and how to keep the old behavior while migrating.
---

# Upgrading to 2.0

## Provider errors are wrapped

An error thrown by a provider (or a rejected promise from an async provider) is now wrapped in a `HaywireProviderError`. Its message names the path from the id you requested to the binding that failed, and the original error is its `cause`, unchanged:

```sh
HaywireProviderError: Provider for DB_URL failed (requested via App -> Database -> DB_URL): DB_URL is missing
    at ...
  [cause]: MissingEnvError: DB_URL is missing
      at ...
```

Code that catches a provider's error by type around `get()` or `getAsync()` must check the `cause` instead:

```ts
import { bind, createContainer, createModule, HaywireProviderError, identifier } from 'haywire';

class MissingEnvError extends Error {}
const dbUrlId = identifier<string>().named('dbUrl');
const container = createContainer(
    createModule(
        bind(dbUrlId).withFactory(() => {
            throw new MissingEnvError('DB_URL is missing');
        })
    )
);
// ---cut---
try {
    container.get(dbUrlId);
} catch (err) {
    if (err instanceof HaywireProviderError && err.cause instanceof MissingEnvError) {
        // Handle the missing variable
    }
}
```

Or create the container with `unsafeRawProviderErrors` to throw provider errors as they are, as before 2.0:

```ts
import { bind, createContainer, createModule, identifier } from 'haywire';

const dbUrlId = identifier<string>().named('dbUrl');
const appModule = createModule(bind(dbUrlId).withInstance('postgres://localhost/app'));
// ---cut---
const container = createContainer(appModule, { unsafeRawProviderErrors: true });
```

`createContainerFactory()`, `module.toContainer()` and `module.toContainerFactory()` take the same option.

Not wrapped:

- Errors thrown by Haywire itself, such as one from a supplier the provider called.
- Errors thrown by a value's own methods after it is created, like `main()` on an entry point.
- Errors from [disposers](/haywire/guides/disposal).
