---
description: Chain Vitest hooks so each one passes typed context to the next. The Vitest version of mocha-chain.
---

# vitest-chain

Chain Vitest hooks so each one passes typed context to the next. The same API as [mocha-chain](/mocha-chain/), for Vitest.

```ts
class Counter {
    count = 0;
    increment(): number {
        return ++this.count;
    }
}
// ---cut---
import { expect } from 'vitest';
import { beforeEach, describe } from 'vitest-chain';

describe('Counter', () => {
    const withCounter = beforeEach(() => ({ counter: new Counter() }));

    withCounter.test('starts at zero', ({ counter }) => {
        expect(counter.increment()).toBe(1);
    });
});
```

**[Get started →](/vitest-chain/getting-started)**

## Features

- **Typed context**: a hook's return value is passed to the hooks and tests chained to it, so test state is never `T | undefined`.
- **Vitest's own context too**: chained callbacks receive the chain's context first, then Vitest's usual arguments, like the test context.
- **Just Vitest**: every function calls Vitest's own, and native Vitest calls can be mixed in.
- **Order checked**: a hook that runs before one it's chained to fails with `HookOrderError`, rather than getting an incomplete context.

[Why mocha-chain](/mocha-chain/why) explains the problem both solve, and [Chaining hooks](/mocha-chain/guides/chaining) how chains work. Both apply to vitest-chain, with `beforeAll` and `afterAll` for Mocha's `before` and `after`.

## Compared to

Vitest's [test context](https://vitest.dev/guide/test-context) can be extended with typed fixtures (`test.extend`), which are set up per test, on demand. vitest-chain uses hooks instead, so the same code works across Mocha and Vitest, and once-per-suite setup (`beforeAll`) can pass context as well.
