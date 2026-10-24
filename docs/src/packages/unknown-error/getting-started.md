---
description: Install unknown-error, and convert, inspect and print a caught value.
---

# Getting started

## Install

::: code-group

```sh [npm]
npm i unknown-error
```

```sh [pnpm]
pnpm add unknown-error
```

```sh [yarn]
yarn add unknown-error
```

:::

::: tip
unknown-error is ESM only, and runs in Node.js 24 or later, Deno, Bun and browsers. From CommonJS, load it with a dynamic import: `const { toError } = await import('unknown-error');`
:::

## Convert a caught value

Pass the `catch` variable to `toError`. Whatever was thrown, you get an `Error`:

```ts
declare function doWork(): void;
// ---cut---
import { toError } from 'unknown-error';

try {
    doWork();
} catch (err) {
    const error = toError(err);
    //    ^?
    console.error(error.message);
}
```

An Error comes back unchanged. Anything else becomes a new Error that describes it:

```ts
import { toError } from 'unknown-error';
// ---cut---
toError('boom').message;               // 'boom'
toError({ status: 404 }).message;      // '{"status":404}'
toError({ message: 'Not found' }).message; // 'Not found'
```

When you only need the text, `getErrorMessage(err)` is the same as `toError(err).message`, and can't throw even when reading `message` does.

## Check an error code

`hasCode` checks for a `code` such as Node's `ENOENT`, and narrows the type when it matches:

```ts
// @filename: node.d.ts
// Docs are type-checked without Node.js types
declare module 'node:fs/promises' {
    export function readFile(path: string, encoding: 'utf8'): Promise<string>;
}
// @filename: index.ts
// ---cut---
import { readFile } from 'node:fs/promises';
import { hasCode } from 'unknown-error';

export const readOptional = async (path: string): Promise<string | null> => {
    try {
        return await readFile(path, 'utf8');
    } catch (err) {
        if (hasCode(err, 'ENOENT')) {
            return null;
        }
        throw err;
    }
};
```

## Print the whole error

`formatError` prints an error with every cause, indented under the error it caused:

```ts
import { formatError } from 'unknown-error';
// ---cut---
const error = new Error('Request failed', {
    cause: new Error('connect ECONNREFUSED 127.0.0.1:5432'),
});

console.log(formatError(error));
// Error: Request failed
//     at ...
//     Caused by: Error: connect ECONNREFUSED 127.0.0.1:5432
//         at ...
```

## Next steps

- [Converting caught values](/packages/unknown-error/guides/converting): what `toError` does with each kind of value.
- [Cause chains](/packages/unknown-error/guides/cause-chains): walk and print causes and `AggregateError` entries.
- [API reference](/packages/unknown-error/reference/api): every export.
