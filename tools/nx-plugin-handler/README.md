<div style="text-align:center">

# nx-plugin-handler
Higher-order wrapper for Nx executor implementations with error handling and project-local forwarding.

[![npm package](https://badge.fury.io/js/nx-plugin-handler.svg)](https://www.npmjs.com/package/nx-plugin-handler)
[![License](https://img.shields.io/npm/l/nx-plugin-handler.svg)](https://github.com/JacobLey/leyman/blob/main/tools/nx-plugin-handler/LICENSE)

</div>

## Contents
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [handler](#handler)
  - [Types](#types)

## Install

```sh
npm i nx-plugin-handler
```

## Example

```ts
// executors/my-executor/executor.ts
import { handler } from 'nx-plugin-handler';
import type { RawHandler } from 'nx-plugin-handler';

const myExecutor: RawHandler<{ dryRun: boolean }> = async (options, context) => {
    console.log(`Running in ${context.root} with dryRun=${options.dryRun}`);
    return { success: true };
};

export default handler(myExecutor);
```

## Usage

`nx-plugin-handler` is a CommonJS module (Nx plugins run in CJS context). Import with `require` or `import`.

Wrapping your executor with `handler`:
- **Catches and logs errors** — uncaught exceptions are caught, logged, and return `{ success: false }` instead of crashing the Nx process
- **Forwards to project-local implementations** — if the project running the executor has its own version of the plugin installed, the executor delegates to that local version (enables monorepo version isolation)

The forwarding check is transparent: if no local version is found, the wrapped executor runs as normal.

## API

### `handler(rawHandler)`

Wraps an Nx executor function with error handling and project-local forwarding.

**Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `rawHandler` | `RawHandler<Options>` | Your executor implementation. |

**Returns** `RawHandler<Options>` — a wrapped executor with the same signature, safe to export as the default export of an executor file.

```ts
import { handler } from 'nx-plugin-handler';

const myImpl = async (options, context) => {
    // ... implementation
    return { success: true };
};

export default handler(myImpl);
```

---

### Types

#### `RawHandler<Options>`

The type of an Nx executor implementation.

```ts
type RawHandler<Options> = (
    options: Options,
    context: PluginContext
) => Promise<{ success: boolean }>;
```

#### `PluginContext`

Extends Nx's `ExecutorContext` with:

| Property | Type | Description |
|----------|------|-------------|
| `forwardedToProject?` | `boolean` | Set to `true` when the handler was forwarded to a project-local version. Available in the executor to detect forwarded execution. |

#### `HandlerWrapper`

The type of the `handler` export itself, useful for typing higher-order executor factories.

```ts
type HandlerWrapper = <Options>(rawHandler: RawHandler<Options>) => RawHandler<Options>;
```

## Also See

- [`@nx/devkit`](https://www.npmjs.com/package/@nx/devkit) — peer dependency providing `ExecutorContext` type
