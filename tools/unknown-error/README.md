<div style="text-align:center">

# unknown-error
Turn any caught `unknown` into a real Error without throwing, even for hostile values, other realms and deep or circular cause chains.

[![npm package](https://badge.fury.io/js/unknown-error.svg)](https://www.npmjs.com/package/unknown-error)
[![License](https://img.shields.io/npm/l/unknown-error.svg)](https://github.com/JacobLey/leyman/blob/main/tools/unknown-error/LICENSE)

</div>

- **Never throws**: Safe on Proxies that throw from every trap, throwing getters, and `toJSON` or `toString` that throw. Handling an error can't raise a new one inside your `catch`.
- **Any realm, any runtime**: Recognizes Errors from `vm`, iframes and workers, where `instanceof Error` fails. Runs in Node.js, Deno, Bun and browsers, using `Error.isError` where it exists.
- **Keeps what it can**: Rebuilds error-shaped objects (from JSON, RPC or `postMessage`) with their name, stack, cause and `code`. Describes anything else readably, including circular objects and BigInts, instead of `[object Object]`.
- **Whole error trees**: Walks `cause` chains and `AggregateError` entries without recursion, so circular or 100,000-deep chains end instead of overflowing the stack.
- **Doesn't modify your errors**: Errors are returned as they are, never patched in place.

## Contents
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [`toError(value)`](#toerrorvalue)
  - [`getErrorMessage(value)`](#geterrormessagevalue)
  - [`hasCode(value, code)`](#hascodevalue-code)
  - [`NonError`](#nonerror)
  - [`walkErrors(value, options?)`](#walkerrorsvalue-options)
  - [`formatError(value, options?)`](#formaterrorvalue-options)

## Install

```sh
npm i unknown-error
```

## Example

```ts
import { formatError, getErrorMessage, hasCode, toError } from 'unknown-error';

export const loadConfig = async (): Promise<Config> => {
    try {
        return await readConfig();
    } catch (err) {
        if (hasCode(err, 'ENOENT')) {
            // `err` is `Error & { readonly code: 'ENOENT' }`
            return defaultConfig;
        }
        console.error(formatError(err));
        throw new Error(`Failed to read config: ${getErrorMessage(err)}`, { cause: toError(err) });
    }
};
```

## Usage

ESM only. Runs in Node.js 24 or later, Deno, Bun and browsers, with no Node.js APIs. From CommonJS, load it with a dynamic import: `const { toError } = await import('unknown-error');`

Errors are recognized with [`Error.isError`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/isError) where the runtime has it: Node.js 24, Chrome 134, Firefox 138, Safari 18.4 and later. In older browsers, they are recognized by `instanceof Error` or their `[object Error]` tag instead, which works across realms too, but also lets through a Proxy around an Error and an object with a forged `Symbol.toStringTag`.

In Safari and in Node.js before 24.3, `Error.isError` returns `false` for a `DOMException`, so there a `DOMException` is rebuilt as a plain Error with the same name and message rather than returned as-is.

Every function takes `unknown`, so pass the `catch` variable straight in. None of them throw, whatever the value.

## API

### `toError(value)`

Converts any caught value to an Error.

| `value` | Result |
|---------|--------|
| An Error, including one from another realm | The same Error, unmodified |
| An object with a string `message` | A new `Error` with the object's `message`, `name`, `stack` and `cause`, and its other own properties (like `code`) copied over |
| Anything else | A new [`NonError`](#nonerror) describing it |

**Returns** `Error`.

```ts
toError(new TypeError('x'));                         // the same TypeError
toError({ name: 'HttpError', message: 'Not found', status: 404 });
// HttpError: Not found, with `status: 404`
toError('boom');                                     // NonError: boom
toError({ count: 1n });                              // NonError: {"count":"1n"}
```

An error-like object without a `stack` gets a stack pointing at the `toError` call, since the original location is unknown.

### `getErrorMessage(value)`

The message of `toError(value)`.

**Returns** `string`. A `message` that isn't a string is stringified, and one whose getter throws gives `'[unreadable message]'`.

```ts
getErrorMessage(new Error('boom')); // 'boom'
getErrorMessage(404);               // '404'
```

### `hasCode(value, code)`

Whether `value` is an Error whose `code` property equals `code`. A type guard, so it narrows `value` to `Error & { readonly code: typeof code }`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | `unknown` | — | A caught value. |
| `code` | `string \| number` | — | The code to match, like `'ENOENT'`. |

**Returns** `boolean`.

Only real Errors match. To match error-like objects too, convert them first: `hasCode(toError(err), 'E_TIMEOUT')`.

### `NonError`

`class NonError extends Error`. Wraps a thrown value that was neither an Error nor shaped like one.

#### `new NonError(thrown, options?)`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `thrown` | `unknown` | — | The value that was thrown. |
| `options` | `ErrorOptions` | — | Standard Error options, such as `cause`. |

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | `'NonError'` | |
| `message` | `string` | A description of `thrown`: strings as-is, objects as JSON (with circular references and BigInts handled), functions as `[Function name]`. Cut to 1,000 characters. |
| `thrown` | `unknown` | The original value. |

### `walkErrors(value, options?)`

Visits `value`, its `cause` chain and the `errors` of any `AggregateError`, depth first: an error, then its cause, then its `errors` in order.

Every value is converted with `toError`, so a cause that isn't an Error still appears. A value already visited is skipped, so circular chains end.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | `unknown` | — | A caught value. |
| `options.maxDepth` | `number` | `32` | Deepest level to visit. The root is level `0`. Pass `Infinity` for no limit. |

**Returns** `Generator<ErrorNode>`.

#### `ErrorNode`

| Property | Type | Description |
|----------|------|-------------|
| `error` | `Error` | The value, converted with `toError`. |
| `depth` | `number` | Distance from the root, which is `0`. |
| `relation` | `'root' \| 'cause' \| 'aggregate'` | How it relates to its parent: the value passed in, its parent's `cause`, or an entry in its parent's `errors`. |
| `truncated` | `boolean` | `true` when `maxDepth` stopped the walk here, so this error's own cause and errors were skipped. |

```ts
const error = new AggregateError([new Error('a'), 'b'], 'all', { cause: new Error('why') });

for (const { error: node, depth, relation } of walkErrors(error)) {
    console.log(depth, relation, node.message);
}
// 0 root all
// 1 cause why
// 1 aggregate a
// 1 aggregate b
```

### `formatError(value, options?)`

Formats an error with every cause and `AggregateError` entry, each indented under its parent. Takes the same options as [`walkErrors`](#walkerrorsvalue-options).

**Returns** `string`.

```ts
console.log(formatError(new Error('request failed', { cause: new Error('ECONNREFUSED') })));
// Error: request failed
//     at ...
//     Caused by: Error: ECONNREFUSED
//         at ...
```

Causes are labelled `Caused by:`, and `AggregateError` entries `-`. Each error is printed as its `stack`, with a `Name: message` line added first when the stack doesn't start with one (as in Firefox and Safari). Where `maxDepth` cut the walk short, a `… more causes omitted` line says so.
