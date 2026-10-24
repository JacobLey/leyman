<div style="text-align:center">

# test-chain-core
Framework-agnostic internals for chaining test hooks with typed context.

[![npm package](https://badge.fury.io/js/test-chain-core.svg)](https://www.npmjs.com/package/test-chain-core)
[![License](https://img.shields.io/npm/l/test-chain-core.svg)](https://github.com/JacobLey/leyman/blob/main/tools/test-chain/test-chain-core/LICENSE)

</div>

## Contents

- [Install](#install)
- [Usage](#usage)
- [API](#api)
- [Also See](#also-see)

## Install

```sh
npm i test-chain-core
```

ESM only, for Node.js 24 or later. It has no peer dependencies: the framework's native methods are passed in.

## Usage

This package is not intended to be used directly in tests. It implements context propagation for [mocha-chain](https://www.npmjs.com/package/mocha-chain) and [vitest-chain](https://www.npmjs.com/package/vitest-chain), which each describe their framework (native methods, how to identify the current test, and naming) and expose precise public types.

## API

### `createChain(framework)`

Builds entrypoint `suite`, `before`, `beforeEach`, `test`, `afterEach`, and `after` methods (with `.only`/`.skip` on `suite` and `test`) on top of a test framework's native methods.

Return values are loosely typed; framework packages cast them to their own public types.

**Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `framework` | `ChainFramework<Key>` | Required. Description of the test framework. |

**Returns** `ChainEntrypoints`: `{ suite, before, beforeEach, test, afterEach, after }`. `suite` and `test` also have `.only` and `.skip`. Each hook returns an object of the chained methods, under the names in `names`.

`ChainFramework<Key>` (`Key` must be an object):

| Property | Type | Description |
|----------|------|-------------|
| `methods` | `NativeMethods` | The framework's native `suite`, `before`, `beforeEach`, `test`, `afterEach`, and `after` methods. |
| `currentTest.inHook` | `(thisArg, args) => Key` | Identify the executing test from a per-test hook's native `this`/arguments. |
| `currentTest.inTest` | `(thisArg, args) => Key` | Identify the executing test from a test's native `this`/arguments. |
| `supportsDone` | `boolean` | Whether callbacks that declare an extra parameter receive a `done` callback. |
| `allowAsyncSuites` | `boolean` | Whether suite callbacks may return a promise. |
| `names` | `ChainNames` | Property names (aliases) each chained method is exposed under: `before`, `beforeEach`, `test`, `skipTest` (aliases of `test.skip`, e.g. `xit`), `afterEach` and `after`, each a `readonly string[]`. |

`Key` identifies the currently executing test (e.g. Mocha's `Test`, Vitest's `task`), used to propagate per-test context.

User callbacks are invoked with the propagated context, followed by whatever arguments the framework passed (and with the framework's `this` binding).

Declaring a hook, test, or suite while a hook/test is executing throws an error.

### `HookOrderError`

Fails a chained hook or test that executes before the hook it is chained from. Context only flows forward, so the framework must run hooks in the order they were registered.

### Types

`Chain`, `ChainEntrypoints`, `ChainHook`, `ChainTest`, `ChainFramework`, `ChainNames`, `ChainSuite`, `NativeMethod`, `NativeMethods`, `NativeMethodWithModifiers` and `UserCallback` describe the framework side. `EmptyContext`, `AllowableAdditionalContext` (`object | null | undefined | void`) and `MergeContext<Existing, Additional>` are the types framework packages use to type the context: merging an object intersects it into the existing context, and any other value leaves it unchanged.

## Also See

- [mocha-chain](https://www.npmjs.com/package/mocha-chain)
- [vitest-chain](https://www.npmjs.com/package/vitest-chain)
