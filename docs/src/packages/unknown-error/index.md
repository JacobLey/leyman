---
description: Turn any caught unknown into a real Error without throwing, even for hostile values, other realms and deep or circular cause chains.
---

# unknown-error

<ProjectHeader />

Turn whatever a `catch` receives into a real Error, and print its whole cause chain, without ever throwing.

```ts
declare function readConfig(): Promise<string>;
// ---cut---
import { formatError, getErrorMessage, hasCode, toError } from 'unknown-error';

try {
    await readConfig();
} catch (err) {
    if (hasCode(err, 'ENOENT')) {
        console.log(err.code);
        //              ^?
    }
    console.error(formatError(err));
    throw new Error(`Failed to read config: ${getErrorMessage(err)}`, { cause: toError(err) });
}
```

**[Get started →](/packages/unknown-error/getting-started)**

## Features

- It's safe on Proxies that throw from every trap, on throwing getters, and on `toJSON` or `toString` that throw, so handling an error can't raise a new one inside your `catch`.
- Errors from `vm`, iframes and workers are recognized, even though `instanceof Error` fails for them. It runs in Node.js, Deno, Bun and browsers, and uses `Error.isError` where it exists.
- Error-shaped objects (from JSON, RPC or `postMessage`) are rebuilt with their name, stack, cause and `code`, and anything else gets a readable description, circular objects and BigInts included. See [Converting caught values](/packages/unknown-error/guides/converting).
- `cause` chains and `AggregateError` entries are walked without recursion, so circular or 100,000-deep chains end instead of overflowing the stack. See [Cause chains](/packages/unknown-error/guides/cause-chains).
- Your errors are returned as they are, and aren't patched in place.

## Compared to

|                                     | unknown-error | [normalize-exception](https://www.npmjs.com/package/normalize-exception) | [ensure-error](https://www.npmjs.com/package/ensure-error) | [serialize-error](https://www.npmjs.com/package/serialize-error) | [pony-cause](https://www.npmjs.com/package/pony-cause) |
| ----------------------------------- | ------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------ |
| Never throws on hostile values      | ✅            | ✅                                                                       | ❌                                                         | ❌                                                               | —                                                      |
| Errors from other realms            | ✅            | ✅                                                                       | ❌                                                         | ✅                                                               | ❌                                                     |
| Readable circular and BigInt values | ✅            | ❌                                                                       | ❌                                                         | ❌                                                               | —                                                      |
| Leaves your errors unmodified       | ✅            | ❌                                                                       | ❌                                                         | ✅                                                               | —                                                      |
| Causes and `AggregateError`         | ✅            | ✅                                                                       | ✅                                                         | —                                                                | Causes only                                            |
| 10,000-deep cause chains            | ✅            | ❌                                                                       | ❌                                                         | —                                                                | ❌                                                     |

See [Why unknown-error](/packages/unknown-error/why) for the full comparison.
