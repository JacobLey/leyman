<div style="text-align:center">

# sinon-typed-stub
Type-safe wrappers for Sinon spies, stubs, and mocks.

[![npm package](https://badge.fury.io/js/sinon-typed-stub.svg)](https://www.npmjs.com/package/sinon-typed-stub)
[![License](https://img.shields.io/npm/l/sinon-typed-stub.svg)](https://github.com/JacobLey/leyman/blob/main/tools/sinon-typed-stub/LICENSE)

</div>

## Contents
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [stubMethod](#stubmethod)
  - [spyMethod](#spymethod)
  - [mockMethod](#mockmethod)

## Install

```sh
npm i sinon-typed-stub --save-dev
```

## Example

```ts
import { stubMethod } from 'sinon-typed-stub';

type Validator = (val: unknown) => val is number;

const stub = stubMethod<Validator>();

stub.stub.returns(false);
stub.stub.withArgs(42).returns(true);

// `stub.method` is typed as `Validator`
console.log(stub.method(42));  // true
console.log(stub.method('x')); // false

console.log(stub.spy.callCount); // 2
```

## Usage

`sinon-typed-stub` is an ESM module and must be `import`ed.

Standard Sinon `stub<Parameters, ReturnType>()` requires you to provide separate generic type parameters for parameters and return type, which is cumbersome for complex function types. `sinon-typed-stub` instead takes the full function type as a single generic, returning a typed object with `.method`, `.spy`, and `.stub` properties all inferring their types from the function signature.

The `.method` property is typed exactly as the original function type and is safe to pass as a dependency in place of the real implementation. The `.stub` property is a fully typed `SinonStub` for setting up expectations and return values.

## API

### `stubMethod<T>()`

Creates a Sinon stub typed to function type `T`. Use this to stub function dependencies that will be injected into the system under test.

**Type parameter** `T extends (...args: any[]) => unknown` — the function type to stub.

**Returns** `StubbedMethod<T>`:

| Property | Type | Description |
|----------|------|-------------|
| `.method` | `T` | The stub callable as the original function type. Pass this as a dependency. |
| `.stub` | `SinonStub<Parameters<T>, ReturnType<T>>` | Full Sinon stub for configuring behavior (`.returns()`, `.resolves()`, `.withArgs()`, etc.). |
| `.spy` | `SinonSpy<Parameters<T>, ReturnType<T>>` | Sinon spy for asserting calls (`.calledOnce`, `.calledWithExactly()`, etc.). |

```ts
import { stubMethod } from 'sinon-typed-stub';

type FetchUser = (id: string) => Promise<User>;

const fetchStub = stubMethod<FetchUser>();
fetchStub.stub.resolves({ id: '1', name: 'Alice' });

const sut = new UserService(fetchStub.method); // typed as FetchUser
await sut.getUser('1');

expect(fetchStub.spy.calledOnceWithExactly('1')).to.equal(true);
```

---

### `spyMethod<T>(fn)`

Wraps an existing function with a Sinon spy, preserving the original function type.

**Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `fn` | `T` | The function to wrap with a spy. |

**Returns** `SpiedMethod<T>`:

| Property | Type | Description |
|----------|------|-------------|
| `.method` | `T` | The spy callable as the original function type. |
| `.spy` | `SinonSpy<Parameters<T>, ReturnType<T>>` | Sinon spy for asserting calls. |

```ts
import { spyMethod } from 'sinon-typed-stub';

const realValidator = (val: unknown): val is string => typeof val === 'string';
const spied = spyMethod(realValidator);

spied.method('hello'); // calls real validator, returns true
expect(spied.spy.calledOnce).to.equal(true);
```

---

### `mockMethod<T>()`

Creates a Sinon mock (expectation) typed to function type `T`. Use when you need to set strict call expectations.

**Type parameter** `T extends (...args: any[]) => unknown` — the function type to mock.

**Returns** `MockedMethod<T>`:

| Property | Type | Description |
|----------|------|-------------|
| `.method` | `T` | The mock callable as the original function type. |
| `.mock` | `SinonExpectation` | Sinon expectation for `.withArgs()`, `.returns()`, `.verify()`. |
| `.stub` | `SinonStub<Parameters<T>, ReturnType<T>>` | Typed stub interface. |
| `.spy` | `SinonSpy<Parameters<T>, ReturnType<T>>` | Typed spy interface. |

```ts
import { mockMethod } from 'sinon-typed-stub';

const mocked = mockMethod<(id: string) => User>();
mocked.mock.once().withArgs('1').returns({ id: '1', name: 'Alice' });

sut.doThing(mocked.method);

mocked.mock.verify(); // asserts expectations were met
```

## Also See

- [`mocha-chain`](https://www.npmjs.com/package/mocha-chain) — type-safe Mocha hook chaining used alongside sinon-typed-stub in this repo's tests
- [Sinon.js](https://sinonjs.org/) — the underlying test double library
