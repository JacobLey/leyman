---
description: toError, getErrorMessage, hasCode, NonError, walkErrors, formatError and the types of unknown-error.
---

# API

Every function takes `unknown`, so the `catch` variable can be passed straight in. None of them throw, whatever the value.

## `toError(value)`

Converts any caught value to an Error.

| `value` | Result |
|---------|--------|
| An Error, including one from another realm | The same Error, unmodified |
| An object with a string `message` | A new `Error` with the object's `message`, `name`, `stack` and `cause`, and its other own properties copied over |
| Anything else | A new [`NonError`](#nonerror) describing it |

**Returns** `Error`. See [Converting caught values](/packages/unknown-error/guides/converting).

## `getErrorMessage(value)`

The message of `toError(value)`.

**Returns** `string`. A `message` that isn't a string is stringified, and one whose getter throws gives `'[unreadable message]'`.

## `hasCode(value, code)`

Whether `value` is an Error whose `code` property equals `code`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | `unknown` | — | A caught value. |
| `code` | `string \| number` | — | The code to match, like `'ENOENT'`. |

**Returns** `boolean`, narrowing `value` to `Error & { readonly code: typeof code }`:

```ts
import { hasCode } from 'unknown-error';

declare const err: unknown;
// ---cut---
if (hasCode(err, 'ENOENT')) {
    console.log(err);
    //          ^?
}
```

Only real Errors match. To match error-like objects too, use `hasCode(toError(err), code)`.

## `NonError`

`class NonError extends Error`. Wraps a thrown value that was neither an Error nor shaped like one.

### `new NonError(thrown, options?)`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `thrown` | `unknown` | — | The value that was thrown. |
| `options` | `ErrorOptions` | — | Standard Error options, such as `cause`. |

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | `'NonError'`. |
| `message` | `string` | A description of `thrown`, cut to 1,000 characters. See [Everything else](/packages/unknown-error/guides/converting#everything-else). |
| `thrown` | `unknown` | The original value. |

## `walkErrors(value, options?)`

Visits `value`, its `cause` chain and the `errors` of any `AggregateError`, depth first: an error, then its cause, then its `errors` in order. Each value is converted with `toError`, and a value already visited is skipped.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | `unknown` | — | A caught value. |
| `options` | [`WalkOptions`](#walkoptions) | `{}` | |

**Returns** `Generator<ErrorNode, void, undefined>`. See [Cause chains](/packages/unknown-error/guides/cause-chains).

## `formatError(value, options?)`

Formats an error with every cause and `AggregateError` entry, each indented under its parent. Causes are labelled `Caused by:` and `AggregateError` entries `-`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `value` | `unknown` | — | A caught value. |
| `options` | [`WalkOptions`](#walkoptions) | `{}` | |

**Returns** `string`. Each error is printed as its `stack`, with a `Name: message` line added first when the stack doesn't start with one. Where `maxDepth` cut the walk short, a `… more causes omitted` line says so.

## Types

### `WalkOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxDepth` | `number` | `32` | Deepest level to visit. The root is level `0`. `Infinity` for no limit. |

### `ErrorNode`

| Property | Type | Description |
|----------|------|-------------|
| `error` | `Error` | The value, converted with `toError`. |
| `depth` | `number` | Distance from the root, which is `0`. |
| `relation` | [`ErrorRelation`](#errorrelation) | How it relates to its parent. |
| `truncated` | `boolean` | `true` when `maxDepth` stopped the walk here, so this error's own cause and errors were skipped. |

### `ErrorRelation`

`'root' | 'cause' | 'aggregate'`: the value passed in, its parent's `cause`, or an entry in its parent's `errors`.
