---
description: The haywire-launcher launch() function and the class it returns.
---

# API

haywire-launcher is ESM only, with `haywire` and `entry-script` as peer dependencies.

## `launch(container, id?, options?)`

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `container` | `Container` | — | Required. A [Haywire container](/packages/haywire/reference/api) that can provide `id`. |
| `id` | `HaywireId` or class | `EntryScript` | The id, or class, to get from the container. Its type must implement entry-script's [`Main`](/packages/entry-script/reference/api#main). |
| `options.dispose` | `boolean` | `false` | [Dispose the container](/packages/haywire/reference/api) once `main()` resolves or rejects, or when getting the id fails. If disposing fails after `main()` rejected, rejects with a `SuppressedError` of both, as `await using` does. |

**Returns** a `WrapperMain`: an [`EntryScript`](/packages/entry-script/reference/api#entryscript) subclass, to export as the module's `default`. The container isn't used until it runs.

| Static method | Description |
|---------------|-------------|
| `main(argv)` | Gets the id from the container with `getAsync()`, and calls its `main(argv)`. Called by entry-script when the module is the entry point. |
| `getOriginal()` | Gets the id from the container, without calling `main`. |

A container that can't provide `id`, or an `id` whose type doesn't implement `Main`, is a type error.
