<div style="text-align:center">

# haywire-launcher
Instantiate and execute your haywire-managed entry script in one line.

[![npm package](https://badge.fury.io/js/haywire-launcher.svg)](https://www.npmjs.com/package/haywire-launcher)
[![License](https://img.shields.io/npm/l/haywire-launcher.svg)](https://github.com/JacobLey/leyman/blob/main/tools/haywire-launcher/LICENSE)

</div>

Guides and the full reference are on the [docs site](https://jacobley.github.io/leyman/haywire-launcher/).

## Contents
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [launch](#launchcontainer-id-options)
- [Also See](#also-see)

## Install

```sh
npm i haywire-launcher
```

## Example

With the default `EntryScript` id (container must bind `EntryScript`):

```ts
import { launch } from 'haywire-launcher';
import { myHaywireContainer } from './container.js';

export default launch(myHaywireContainer);
```

With your own class (any class implementing the `Main` interface), or its id:

```ts
import { launch } from 'haywire-launcher';
import { MyCli } from './cli.js';
import { myHaywireContainer } from './container.js';

export default launch(myHaywireContainer, MyCli);
```

With an id, for a type that isn't a class:

```ts
import type { Main } from 'entry-script';
import { identifier } from 'haywire';
import { launch } from 'haywire-launcher';
import { myHaywireContainer } from './container.js';

// Import the real mainId from wherever it is defined in your project
const mainId = identifier<Main>();

export default launch(myHaywireContainer, mainId);
```

## Usage

`haywire-launcher` is an ESM module. It _must_ be `import`ed. To load from a CJS module, use dynamic import: `const { launch } = await import('haywire-launcher');`.

The problem `haywire-launcher` solves: naively calling `container.getAsync(EntryScript)` at the top level of a module triggers container instantiation at import time, making it impossible to mock dependencies in tests. `launch` returns an `EntryScript` subclass synchronously — the container is only resolved when the script is actually executed as the entry point.

## API

### `launch(container, id?, options?)`

Returns an `EntryScript` subclass that, when invoked as the entry point, resolves the given id from the container and delegates execution to it.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `container` | `Container` | — | Required. A haywire async container capable of providing the target instance. |
| `id` | `HaywireId` or class | `EntryScript` | Optional. The haywire id, or class, to request from the container. Must resolve to a type implementing `Main`. |
| `options.dispose` | `boolean` | `false` | Optional. Dispose the container (`container.disposeAsync()`) once `main()` resolves or rejects, or when getting the id fails. Off by default, for a `main()` that returns while what it started (like a server) keeps running. If disposing fails after `main()` rejected, rejects with a `SuppressedError` of both, as `await using` does. |

**Returns** `WrapperMain` (an `EntryScript` subclass) — a class that can be exported as `default` and will be picked up by the `entry-script` lifecycle.

**Type errors** — Passing a container that cannot provide a binding for the given id, or an id whose type does not implement `Main`, is a compile-time error that says which, e.g. `Property 'error' is missing ... '{ error: "Error: the container has no binding for this id."; }'`.

```ts
import { launch } from 'haywire-launcher';
import { myHaywireContainer } from './container.js';

// Container must have a binding for EntryScript
export default launch(myHaywireContainer);
```

## Also See

- [`haywire`](https://www.npmjs.com/package/haywire) — the type-safe dependency injection library used to build containers
- [`entry-script`](https://www.npmjs.com/package/entry-script) — the base class that controls entry point execution
