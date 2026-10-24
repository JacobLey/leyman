---
description: Collect many independent bindings, like plugins or middleware, into one array.
---

# Lists

Most ids have exactly one binding. To let many independent bindings contribute to one collection, such as plugins or middleware, mark the id with `.list()`. Every binding for it is collected into an array:

```ts
import { bind, createContainer, createModule, identifier } from 'haywire';

interface Plugin {
    name: string;
}
const pluginId = identifier<Plugin>().list();

class PluginRunner {
    constructor(public readonly plugins: Plugin[]) {}
}

const container = createContainer(
    createModule(bind(pluginId).withFactory(() => ({ name: 'logging' })))
        // Adding more bindings to a list is allowed
        .addBinding(bind(pluginId).withFactory(() => ({ name: 'metrics' })))
        .addBinding(bind(PluginRunner).withDependencies([pluginId]).withConstructorProvider())
);

container.get(pluginId); // [{ name: 'logging' }, { name: 'metrics' }], in any order
```

Each `list()` binding's provider returns one element. To contribute several, or none, bind with `.list('multi')` and return an array:

```ts
import { bind, identifier } from 'haywire';

interface Plugin {
    name: string;
}
const pluginId = identifier<Plugin>().list();
// ---cut---
bind(pluginId.list('multi')).withFactory(() => [{ name: 'auth' }, { name: 'cache' }]);
```

`list()` and `list('multi')` bindings for the same id are collected together, and depending on either resolves the whole list.

## Things to know

- **Order is only kept within a provider.** Elements from different bindings come in no guaranteed order, not the order they were added.
- **`nullable()` and `undefinable()` apply to each element.** A list can only be depended on as non-null if every binding is non-null, so one `.nullable()` binding makes the whole list nullable.
- A nullable `list('multi')` provider that returns `null` contributes one `null` element. Return `[]` to contribute nothing.
- The same binding added more than once, for example through two merged modules, is included once. Separate bindings are always included, even if they return equal values.
- Lists work with [scopes](/packages/haywire/guides/scopes), [suppliers](/packages/haywire/guides/suppliers) and [deferred ids](/packages/haywire/guides/circular-dependencies). Each binding in the list is scoped on its own.
- [`replaceBinding()`](/packages/haywire/guides/testing#replacing-bindings) replaces every binding in the list.
- A [container factory](/packages/haywire/guides/runtime-values) can `bindInstance()` a list id several times, each adding to the elements bound in the module.
