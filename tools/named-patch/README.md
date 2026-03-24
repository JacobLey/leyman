<div style="text-align:center">

# named-patch
Higher-order function for patching named export functions in tests.

[![npm package](https://badge.fury.io/js/named-patch.svg)](https://www.npmjs.com/package/named-patch)
[![License](https://img.shields.io/npm/l/named-patch.svg)](https://github.com/JacobLey/leyman/blob/main/tools/named-patch/LICENSE)

</div>

## Contents
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [patch](#patchfn)
  - [patchKey](#patchkey)
  - [getPatched](#getpatchedfn)

## Install

```sh
npm i named-patch
```

## Example

```ts
// a.ts
import { patch } from 'named-patch';

export const randName = patch(<T extends string>(names: T[]) => names[Math.trunc(Math.random() * names.length)]);

// test.ts
import { patchKey } from 'named-patch';
import { randName } from './a.js';

randName(['foo', 'bar']); // 'foo' or 'bar'
// Still supports generics
randName<'abc' | 'xyz'>(['abc', 'xyz']); // 'abc' or 'xyz'

randName[patchKey] = () => '<custom>';
randName(['foo', 'bar']); // '<custom>'
```

## Usage

`named-patch` is an ESM module. It must be `import`ed. To load from a CJS module, use dynamic import: `const { patch } = await import('named-patch')`.

The package exports two different implementations depending on the Node.js condition in use:

- **Default** (no special condition): `patch` returns the function unchanged — zero overhead in production.
- **`patchable` condition**: enables the wrapping behaviour along with `patchKey` and `getPatched`.

Enable the `patchable` condition in test environments:

```sh
node --conditions=patchable ./my-script.js
NODE_OPTIONS='--conditions=patchable' node ./my-script.js
```

Mocha users can set this via the [`node-option`](https://mochajs.org/#-node-option-name-n-name) config key.

The key use case is replacing module mocking with runtime patching: wrap any function with `patch()` at the module level, then reassign `fn[patchKey]` in tests. Because `patch()` is idempotent and cached, any file that imports the same original function and passes it through `patch()` will receive the same patchable wrapper — making third-party functions patchable without re-exporting them.

## API

### `patch(fn)`

Returns a patchable wrapper around `fn`. By default the wrapper calls `fn` internally. Reassign `wrapper[patchKey]` to swap the implementation at runtime.

The wrapper preserves the full TypeScript type of `fn`, including generics, `async`, and `this` binding. Patching is idempotent: calling `patch()` on the same function or on an already-patched wrapper always returns the same wrapper object.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `fn` | `(...args: any[]) => any` | — | Required. The function to make patchable. |

**Returns** `PatchableInterface<T>` — a wrapper with the same signature as `fn` plus a writable `[patchKey]` property.

```ts
import { patch } from 'named-patch';

const original = (x: number, y: number) => x + y;
const patched = patch(original);

patch(original) === patched; // true
patch(patched) === patched;  // true
```

---

### `patchKey`

A unique `symbol` written onto every wrapper returned by `patch`. Assign a new function to `wrapper[patchKey]` to replace the implementation.

Only exported when the `patchable` condition is active.

```ts
import { patch, patchKey } from 'named-patch';
import { stub } from 'sinon';

const fn = patch((x: number) => x * 2);
stub(fn, patchKey).returns(99);
fn(5); // 99
```

---

### `getPatched(fn)`

Returns the already-cached patchable wrapper for `fn` without creating one. Use this in tests when you want to assert that `patch()` was called on a function rather than silently creating the wrapper for the first time.

Only exported when the `patchable` condition is active.

**Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `fn` | `(...args: any[]) => any` | — | Required. The original (unpatched) function to look up. |

**Returns** `PatchableInterface<T>` — the cached wrapper.

**Throws** `Error` — if `fn` has never been passed to `patch()`, or if `fn` is itself already a patched wrapper.
