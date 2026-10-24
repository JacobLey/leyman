---
description: What toError returns for Errors, error-like objects and every other value, and how it stays safe on hostile ones.
---

# Converting caught values

`toError` sorts what it's given into three kinds.

## Errors

An Error is returned as it is: the same object, unmodified.

That includes Errors from another realm, like a `vm` context or an iframe. Each realm has its own `Error` class, so `instanceof Error` is `false` for them. `toError` uses [`Error.isError`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/isError) instead, which recognizes them:

```ts
// @filename: node.d.ts
// Docs are type-checked without Node.js types
declare module 'node:vm' {
    export function runInNewContext(code: string): unknown;
}
// @filename: index.ts
// ---cut---
import { runInNewContext } from 'node:vm';
import { toError } from 'unknown-error';

const foreign: unknown = runInNewContext('new TypeError("x")');

foreign instanceof Error; // false
toError(foreign) === foreign; // true
```

`Error.isError` is in Node.js 24, Chrome 134, Firefox 138, Safari 18.4 and later. In older browsers, Errors are recognized by `instanceof Error` or their `[object Error]` tag. That works across realms too, but also lets through a Proxy around an Error and an object with a forged `Symbol.toStringTag`. Both checks run inside a `try`, so a Proxy that throws can't escape.

In Safari and in Node.js before 24.3, `Error.isError` returns `false` for a `DOMException`. There, a `DOMException` is rebuilt as a plain Error with the same name and message, rather than returned as-is.

## Error-like objects

An object with a string `message` is usually an error that lost its prototype on the way, through JSON, `postMessage` or an RPC framework. `toError` rebuilds it as an `Error` with its `name`, `message`, `stack` and `cause`, and copies its other own properties over:

```ts
import { toError } from 'unknown-error';

const error = toError(
    JSON.parse('{"name":"HttpError","message":"Not found","status":404}')
);

error instanceof Error; // true
error.name; // 'HttpError'
(error as Error & { status: number }).status; // 404
```

Properties the new Error already has, own or inherited, aren't copied. That includes `__proto__`, so a JSON-parsed `"__proto__"` key can't replace the Error's prototype.

Without a `stack` of its own, the rebuilt Error's stack points at the `toError` call.

## Everything else

Any other value is wrapped in a `NonError`, which keeps the value as `thrown` and describes it in its message:

```ts
import { NonError, toError } from 'unknown-error';

const value: Record<string, unknown> = { id: 7, total: 10n };
value.self = value;

const error = toError(value);

error instanceof NonError; // true
error.message; // '{"id":7,"total":"10n","self":"[Circular]"}'
(error as NonError).thrown === value; // true
```

| Value | Message |
|-------|---------|
| String | The string itself |
| `null`, `undefined`, number, boolean, symbol | `String(value)`, like `'null'` or `'Symbol(id)'` |
| BigInt | `'10n'` |
| Function | `'[Function name]'`, never its source |
| Object or array | JSON, with circular references as `"[Circular]"` and BigInts as `"10n"` |

When an object's JSON is empty (`toJSON` returns `undefined`) or throws, the message falls back to `String(value)`, then to the object's tag (`[object Object]`), and finally to `[unprintable value]`. Messages are cut to 1,000 characters.

## Hostile values

Inspecting a thrown value runs its code: getters, Proxy traps, `toString` and `toJSON`. Any of them can throw, and a conversion that lets that through replaces the original error with a new one inside your `catch`.

Every read unknown-error makes is guarded, so none of its functions throw:

```ts
import { getErrorMessage, toError } from 'unknown-error';

const hostile = new Proxy(
    {},
    {
        get: () => {
            throw new Error('get');
        },
        getPrototypeOf: () => {
            throw new Error('getPrototypeOf');
        },
        ownKeys: () => {
            throw new Error('ownKeys');
        },
    }
);

toError(hostile).message; // '[unprintable value]'

const error = new Error('x');
Object.defineProperty(error, 'message', {
    get: () => {
        throw new Error('message');
    },
});
getErrorMessage(error); // '[unreadable message]'
```

## Checking codes

`hasCode` only matches real Errors, since it narrows to `Error & { code }`. To match an error-like object too, convert it first:

```ts
import { hasCode, toError } from 'unknown-error';

declare const err: unknown;
// ---cut---
if (hasCode(toError(err), 'E_TIMEOUT')) {
    // retry
}
```
