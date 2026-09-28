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

## Usage

This package is not intended to be used directly in tests. It implements context propagation for [mocha-chain](../mocha-chain/README.md) (and future framework integrations), which describe their framework (native methods, how to identify the current test, and naming) and expose precise public types.

## API

### `createChain(framework)`

Builds entrypoint `suite`, `before`, `beforeEach`, `test`, `afterEach`, and `after` methods (with `.only`/`.skip` on `suite` and `test`) on top of a test framework's native methods.

Return values are loosely typed; framework packages cast them to their own public types.

**Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `framework` | `ChainFramework<Key>` | Required. Description of the test framework. |

`ChainFramework<Key>`:

| Property | Type | Description |
|----------|------|-------------|
| `methods` | `NativeMethods` | The framework's native `suite`, `before`, `beforeEach`, `test`, `afterEach`, and `after` methods. |
| `currentTest.inHook` | `(thisArg, args) => Key` | Identify the executing test from a per-test hook's native `this`/arguments. |
| `currentTest.inTest` | `(thisArg, args) => Key` | Identify the executing test from a test's native `this`/arguments. |
| `supportsDone` | `boolean` | Whether callbacks that declare an extra parameter receive a `done` callback. |
| `names` | `ChainNames` | Property names (aliases) each chained method is exposed under. |

`Key` identifies the currently executing test (e.g. Mocha's `Test`, Vitest's `task`), used to propagate per-test context.

User callbacks are invoked with the propagated context, followed by whatever arguments the framework passed (and with the framework's `this` binding).

Declaring a hook, test, or suite while a hook/test is executing throws an error.

### `HookOrderError`

Thrown (via the rejected `handler`) when a chained hook executes before the hook it is chained from.

## Also See

- [mocha-chain](../mocha-chain/README.md)
