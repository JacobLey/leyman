<div style="text-align:center">

<h1>named-patch</h1>
<p>Enable monkey patching of named ESM exports.</p>

[![npm package](https://badge.fury.io/js/named-patch.svg)](https://www.npmjs.com/package/named-patch)
[![License](https://img.shields.io/npm/l/named-patch.svg)](https://github.com/JacobLey/leyman/blob/main/tools/named-patch/LICENSE)
[![Quality](https://img.shields.io/npms-io/quality-score/named-patch.svg)](https://github.com/JacobLey/leyman/blob/main/tools/named-patch)

</div>

## Contents
- [Introduction](#introduction)
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)

<a name="Introduction"></a>
## Introduction

Enables monkey patching of a named ESM export.

[Monkey Patching](https://en.wikipedia.org/wiki/Monkey_patch) is a common way to replace a function with a mock or listener (such as [`Sinon.stub`](https://sinonjs.org/releases/latest/stubs/)). In most JS interfaces, this can be done natively by re-writing the property on the parent object.

For example:
```ts
const mock = () => '<mocked>';
process.exit = mock;

import Path from 'node:path';
Path.join = mock;

process.exit() // '<mocked>'
Path.join() // '<mocked>'
```

However this is not possible with named imports/exports, as modules (generated via namespace imports `import * as Namespace`) are not writable, and importing the name directly does not
provide a parent object to write to.

```ts
import * as NamespacePath from 'node:path';

const mock = () => '<mocked>';
// TypeError: Cannot assign to read only property 'join' of object '[object Module]'
NamespacePath.join = mock;
```

This generally requires wrapping named imports into a single container,
which defeats the benefits of named imports (e.g. tree shaking).
This is how the `Path.join` patching works in the first example.

```ts
import { join } from 'node:path';

const mock = () => '<mocked>';
const container = { join };
container.join = mock;

container.join(); // '<mocked>'
```

The solution is to wrap named exports in a higher-order-function that proxies requests to the input function by default, and enables patching that method in testing environments.

<a name="Install"></a>
## Install

```sh
npm i named-patch
```

<a name="Example"></a>
## Example

```ts
// a.js
import { patch } from 'named-patch';

export const randName = patch(<T extends string>(names: T[]) => names[Math.trunc(Math.random() * names.length)]);

// b.js
import { patchKey } from 'named-patch';
import { randName } from './a.js';

rand(['foo', 'bar']); // 'foo'
// Still supports generics
rand<'abc' | 'xyz'>(['abc', 'xyz']); // 'xyz'

rand[patchKey] = () => '<custom>';
rand(['foo', 'bar']); // '<custom>'
```

<a name="Usage"></a>
## Usage

`named-patch` is an ESM module. That means it _must_ be `import`ed. To load from a CJS module, use dynamic import `const { patch } = await import('named-patch');`.

This module exports 2 different packages depending on the environment. By default it is the noop module which only exports the `patch` method that returns the method _unchanged_.

Using a [Condition](https://nodejs.org/dist/latest/docs/api/packages.html#resolving-user-conditions) of `--conditions=patchable` will enable the `patchKey` and `getPatched` methods.

This enforces a best practice that _by default_ monkey patching and stubbing is a testing-specific pattern that should be omitted in production.

Conditions may be set a number of ways:
* `node --conditions=patchable ./my-script.js`
* `NODE_OPTIONS='--conditions=patchable' node ./my-script.js`
    * Frameworks like `mocha` provide setting these conditions via config's [`node-option`](https://mochajs.org/#-node-option-name-n-name).

<a name="Api"></a>
## API

### patch(fn)

Returns a wrapper around `fn` that _by default_ calls `fn` internally.
The behavior of the wrapper can be overwritten by writing the [`patchKey`](#patchkey) property of the wrapper.

It will have the same typescript properties as the input function (with addition of `patchKey` property) with full support for generics.

Async functions and references to `this` are handled appropriately.

Patching a function is idempotent and cache-able.
```ts
import { patch } from 'named-patch';

const original = () => {};
const patched = patch(original);
patch(original) === patched; // true
patch(patched) === patched; // true
```

It is always possible to get a consistent patchable version of a method by passing it to the `patch` method. Therefore cases where a patching happens _internally_ to a module and not re-exported is still patchable.
```ts
// a.js
import { readFileSync } from 'node:fs/promises';
import { patch } from 'named-patch';

const patchedReadFileSync = patch(readFileSync);

export const getFileData = (fileName: string): string => patchedReadFileSync(filename, 'utf8');

// b.js
import { readFileSync } from 'node:fs/promises';
import { patch, patchKey } from 'named-patch';
import { getFileData } from './a.js';

const patchedReadFileSync = patch(readFileSync);
patchedReadFileSync = () => '<fake-data>';

getFileData('<file-name>'); // '<fake-data>';
```

### patchKey

A unique symbol written onto all wrappers returned from [`patch`](#patch).

Will _only_ be exported from module when `patchable` condition is set.

### getPatched(fn)

Helper method that will return the patched version of a function.
Throws if the method has never been patched.

Useful for test environments where the _existence_ of a patch is being tested,
and relying on [`patch`](#patch)'s idempotency may accidentally write the patch for the first time.

Will _only_ be exported from module when `patchable` condition is set.
