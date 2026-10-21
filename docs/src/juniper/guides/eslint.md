---
description: Report Juniper schemas built inside functions with the juniper ESLint plugin.
---

# ESLint

Juniper schemas are meant to be built once, at module scope, and reused. The `juniper/eslint` plugin reports schemas built anywhere else.

```js
// eslint.config.js
import juniper from 'juniper/eslint';

export default [juniper.configs.recommended];
```

`configs.recommended` registers the plugin (as `juniper`) and turns on every rule as an error. To pick rules yourself, register it and configure them:

```js
// eslint.config.js
import juniper from 'juniper/eslint';

export default [
    {
        plugins: { juniper },
        rules: { 'juniper/top-level-schema': 'warn' },
    },
];
```

The plugin is a separate entry point, so importing `juniper` never loads it. `eslint` is an optional peer dependency, needed only when you use the plugin.

## `juniper/top-level-schema`

Reports a schema built inside a function, or in a class instance field, rather than once at module scope:

```ts
import { objectSchema, stringSchema } from 'juniper';

// ❌ built on every call
export const slowJson = () => objectSchema({ properties: { name: stringSchema() } }).toJSON();

// ✅ built once
const bodySchema = objectSchema({ properties: { name: stringSchema() } });
export const fastJson = () => bodySchema.toJSON();
```

Every builder call clones the schema, so a schema built per call is wasted work, often on a hot path like a request handler. With [`.define()`](/juniper/guides/reusing-schemas), it's worse: `toJSON()` throws when two different instances are defined under the same name, as each call's would be.

What it checks:

- Calls to the schema factories imported from `juniper`: `objectSchema()`, `stringSchema()` and the rest, `ObjectSchema.create()` and the other classes' `create()`, and `defineRecursive()`. Named, renamed and namespace imports are all followed.
- Inside any function, and in non-static class fields, which run once per instance. Static fields run once, so they're fine.
- Schemas built in a `defineRecursive` callback are fine too, since it runs once, when the definition is built.
- So are schemas built in a function that's called immediately at module scope, like `const a = (() => objectSchema())();`, since it also runs once.

What it doesn't check:

- Methods called on an existing schema, like `.toJSON()`, `.pick()` or `.nullable()`. Those need type information to tell apart from other methods.
- Whether a function only runs at module scope. A helper that builds a schema from its arguments, like `const titled = title => objectSchema({ title })`, is reported, even if it's only called at the top level. Disable the rule for that helper, with a comment saying why:

```ts
import { objectSchema } from 'juniper';

// eslint-disable-next-line juniper/top-level-schema -- only called at module scope
const titled = (title: string) => objectSchema({ title });

export const user = titled('User');
```

There is no autofix: moving a schema out of its function can change what it refers to.
