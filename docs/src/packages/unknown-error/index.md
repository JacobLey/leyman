---
description: Turn any caught unknown into a real Error without throwing, even for hostile values, other realms and deep or circular cause chains.
---

# unknown-error

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

- **Never throws**: Safe on Proxies that throw from every trap, throwing getters, and `toJSON` or `toString` that throw. Handling an error can't raise a new one inside your `catch`.
- **Any realm, any runtime**: Recognizes Errors from `vm`, iframes and workers, where `instanceof Error` fails. Runs in Node.js, Deno, Bun and browsers, using `Error.isError` where it exists.
- **Keeps what it can**: Rebuilds error-shaped objects (from JSON, RPC or `postMessage`) with their name, stack, cause and `code`. Describes anything else readably, including circular objects and BigInts. See [Converting caught values](/packages/unknown-error/guides/converting).
- **Whole error trees**: Walks `cause` chains and `AggregateError` entries without recursion, so circular or 100,000-deep chains end instead of overflowing the stack. See [Cause chains](/packages/unknown-error/guides/cause-chains).
- **Doesn't modify your errors**: Errors are returned as they are, never patched in place.

## Compared to

| | unknown-error | [normalize-exception](https://www.npmjs.com/package/normalize-exception) | [ensure-error](https://www.npmjs.com/package/ensure-error) | [serialize-error](https://www.npmjs.com/package/serialize-error) | [pony-cause](https://www.npmjs.com/package/pony-cause) |
|---|---|---|---|---|---|
| Never throws on hostile values | ✅ | ✅ | ❌ | ❌ | — |
| Errors from other realms | ✅ | ✅ | ❌ | ✅ | ❌ |
| Readable circular and BigInt values | ✅ | ❌ | ❌ | ❌ | — |
| Leaves your errors unmodified | ✅ | ❌ | ❌ | ✅ | — |
| Causes and `AggregateError` | ✅ | ✅ | ✅ | — | Causes only |
| 10,000-deep cause chains | ✅ | ❌ | ❌ | — | ❌ |

See [Why unknown-error](/packages/unknown-error/why) for the full comparison.
