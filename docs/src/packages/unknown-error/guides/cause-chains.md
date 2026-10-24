---
description: Walk and print an error's cause chain and AggregateError entries, safely on circular and very deep chains.
---

# Cause chains

An error's `cause` can be another error with its own cause, and an `AggregateError` holds a list of errors, each of which can have causes. `walkErrors` visits all of it, and `formatError` prints it.

## Walking

`walkErrors` yields an `ErrorNode` for the value and everything nested in it, depth first: an error, then its cause, then its `errors` in order.

```ts
import { walkErrors } from 'unknown-error';

const error = new AggregateError([new Error('a'), 'b'], 'all', {
    cause: new Error('why'),
});

for (const node of walkErrors(error)) {
    //     ^?
    console.log(node.depth, node.relation, node.error.message);
}
// 0 root all
// 1 cause why
// 1 aggregate a
// 1 aggregate b
```

Each value is converted with [`toError`](/packages/unknown-error/guides/converting), so a cause that isn't an Error (like `'b'` above) still appears.

Use it to search a chain, for example for the first error with a given code:

```ts
import { hasCode, walkErrors } from 'unknown-error';

declare const err: unknown;
// ---cut---
const refused = [...walkErrors(err)].find(({ error }) => hasCode(error, 'ECONNREFUSED'));
```

## Printing

`formatError` prints each error's stack, indented under its parent. Causes are labelled `Caused by:`, and `AggregateError` entries `-`:

```ts
import { formatError } from 'unknown-error';
// ---cut---
const error = new AggregateError(
    [new Error('Disk full'), new Error('Timed out')],
    'Every replica failed',
    { cause: new Error('Primary is down') }
);

console.log(formatError(error));
// AggregateError: Every replica failed
//     at ...
//     Caused by: Error: Primary is down
//         at ...
//     - Error: Disk full
//         at ...
//     - Error: Timed out
//         at ...
```

V8 starts a stack with the `Name: message` line, but Firefox and Safari don't. When a stack doesn't start with it, `formatError` adds it, so every entry is labelled the same way.

## Circular chains

A value already visited is skipped, so a circular chain ends:

```ts
import { walkErrors } from 'unknown-error';
// ---cut---
const a = new Error('a');
const b = new Error('b', { cause: a });
Object.defineProperty(a, 'cause', { value: b });

[...walkErrors(a)].map(({ error }) => error.message); // ['a', 'b']
```

The same primitive can appear more than once, since primitives have no identity to track.

## Depth limit

The walk stops at `maxDepth` levels below the root, 32 by default. An error whose cause or `errors` were skipped has `truncated: true`, and `formatError` adds a line where it stopped:

```ts
import { formatError, walkErrors } from 'unknown-error';
// ---cut---
let error = new Error('root cause');
for (let attempt = 1; attempt <= 5; attempt++) {
    error = new Error(`Attempt ${attempt} failed`, { cause: error });
}

[...walkErrors(error, { maxDepth: 2 })].map(({ truncated }) => truncated); // [false, false, true]

console.log(formatError(error, { maxDepth: 2 }));
// Error: Attempt 5 failed
//     at ...
//     Caused by: Error: Attempt 4 failed
//         at ...
//         Caused by: Error: Attempt 3 failed
//             at ...
//             … more causes omitted (maxDepth: 2)
```

Pass `maxDepth: Infinity` for no limit. The walk uses a stack of its own rather than recursion, so even a chain 100,000 levels deep can't overflow the call stack.
