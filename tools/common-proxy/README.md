<div style="text-align:center">

# common-proxy
Wrap an ESM import so it is synchronously available as a promise-returning function in CommonJS.

[![npm package](https://badge.fury.io/js/common-proxy.svg)](https://www.npmjs.com/package/common-proxy)
[![License](https://img.shields.io/npm/l/common-proxy.svg)](https://github.com/JacobLey/leyman/blob/main/tools/common-proxy/LICENSE)

</div>

## Contents
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [commonProxy](#commonproxypromisedFn)
  - [commonProxyDecorator](#commonproxydecoratorpromiseddecorator)

## Install

```sh
npm i common-proxy
```

## Example

**Before** — ESM import is not synchronously available in CJS:

```cts
// my-module.cts
// Error! Cannot statically import an ESM package from CJS.
import add from './my-module.mjs';

(async () => {
    // Works, but the result is not accessible outside the async block.
    const { sayHello } = await import('./my-module.mjs');
    sayHello('Jacob');
})();
```

**After** — wrap the dynamic import with `commonProxy`:

```cts
// my-module.cts
import { commonProxy } from 'common-proxy';

const imported = import('./my-module.mjs');

export default commonProxy(imported);
export const sayHello = imported.then(mod => mod.sayHello);
```

```cts
// consumer.cts
import add, { sayHello } from './my-module.cjs';

// Both return promises and are usable at the top level of the module.
const sum: Promise<number> = add(1, 2);
const greeting = sayHello('Jacob');
```

## Usage

`common-proxy` is itself a **CommonJS** package (the export is a `.cjs` file), so it can be `require()`d or statically imported from any CJS file without a dynamic import.

The typical pattern is:

1. Create a `.cts` bridge module next to your ESM source.
2. Call `import('./your-esm-module.mjs')` to get a `Promise` of the module.
3. Pass that promise to `commonProxy()` for the default export, or chain `.then(mod => mod.methodName)` for named exports.

If the promise resolves to a module object that has a `default` property (as `import()` does for ES modules with a default export), `commonProxy` automatically unwraps it via [`default-import`](https://www.npmjs.com/package/default-import).

## API

### `commonProxy(promisedFn)`

Takes a promise of a function and synchronously returns a wrapper function with the same call signature. Calling the wrapper returns a promise that resolves with the result of the real function.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `promisedFn` | `Promise<Handler>` or `Promise<{ default: Handler }>` | — | Required. A promise of the function to proxy, typically the result of a dynamic `import()`. |

**Returns** a function with the same parameters as `Handler` that returns `Promise<ReturnType<Handler>>`. If `Handler` already returns a `Promise`, the return type is preserved as-is.

```cts
import { commonProxy } from 'common-proxy';

const add = commonProxy(import('./math.mjs').then(m => m.add));
const result: Promise<number> = add(1, 2);
```

---

### `commonProxyDecorator(promisedDecorator)`

Variant of `commonProxy` for higher-order decorator functions. Takes a promise of a decorator (a function that wraps another function) and returns a synchronous decorator with the same interface, where calls return promises.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `promisedDecorator` | `Promise<Decorator>` or `Promise<{ default: Decorator }>` | — | Required. A promise of the decorator function. |

**Returns** a decorator with the same parameters that wraps handlers so their return values become promises.
