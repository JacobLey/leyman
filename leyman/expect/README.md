<div style="text-align:center">

# @leyman/expect

Chai's expect and assert with chai-as-promised registered, as one ESM import, so async assertions work in any test file without setup.

[![npm package](https://badge.fury.io/js/@leyman%2Fexpect.svg)](https://www.npmjs.com/package/@leyman/expect)
[![License](https://img.shields.io/npm/l/@leyman/expect.svg)](https://github.com/JacobLey/leyman/blob/main/leyman/expect/LICENSE)

</div>

- **No setup file** — importing it registers chai-as-promised, so `rejectedWith` and `eventually` work in any test, whatever the runner or its config.
- **One dependency instead of four** — `chai`, `chai-as-promised` and both `@types` packages come with it.
- **Types included** — the declarations load chai-as-promised's type augmentations, so `.rejectedWith` type-checks without importing it yourself.

## Contents

- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)

## Install

```sh
npm i -D @leyman/expect
```

## Example

```ts
import { expect } from '@leyman/expect';

const thrown: unknown = await expect(myPromise()).to.be.rejectedWith(Error);
expect(thrown).to.have.property('message').that.includes('<ERROR>');
```

## Usage

The package is ESM only. Importing it calls `chai.use(chaiAsPromised)` once, on the `chai` it depends on, so it is a module with side effects. If your tests import `chai` directly too, make sure it resolves to the same copy, or that copy won't have chai-as-promised registered.

It is meant for tests: depend on it as a dev dependency.

## API

### `expect`, `assert`

Chai's own `expect` and `assert`, re-exported after chai-as-promised is registered. See [Chai's docs](https://www.chaijs.com/api/bdd/) and [chai-as-promised's](https://github.com/chaijs/chai-as-promised#readme).

### `ChaiAsPromised`

The type of the chai-as-promised plugin. Exported so the declarations import chai-as-promised, which is what loads its augmentations of Chai's types.
