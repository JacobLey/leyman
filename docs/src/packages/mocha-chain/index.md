---
description: Chain Mocha hooks so each one passes typed context to the next, instead of sharing nullable variables.
---

# mocha-chain

<ProjectHeader />

Chain Mocha hooks so each one passes typed context to the next, instead of sharing nullable variables between them.

```ts
class Counter {
    count = 0;
    increment(): number {
        return ++this.count;
    }
}
// ---cut---
import { expect } from 'chai';
import { beforeEach, suite } from 'mocha-chain';

suite('Counter', () => {
    const withCounter = beforeEach(() => ({ counter: new Counter() }));

    withCounter.test('starts at zero', ({ counter }) => {
    //                                    ^?
        expect(counter.increment()).to.equal(1);
    });
});
```

`counter` is typed `Counter` in every test (not `Counter | undefined`), and each test gets a new one.

**[Get started →](/packages/mocha-chain/getting-started)**

## Features

- A hook returns an object, and the hooks and tests chained to it receive it as their first parameter, merged with what earlier hooks returned.
- Each test gets its own shallow copy of the context, from the hooks that ran for it.
- Every function calls Mocha's own, so `this.timeout()`, `.only()`, `.skip()`, retries and reporters all work, and you can mix in native Mocha calls.
- A test or hook declared inside another test or hook throws, where Mocha would silently ignore it.
- `afterEach` and `after` receive what setup returned, so cleanup is typed too.
- [vitest-chain](/packages/vitest-chain/) has the same API for Vitest.

## Compared to

- Plain Mocha: a `let` variable assigned in `beforeEach` must be typed `T | undefined`, and asserted non-null in every test. See [Why mocha-chain](/packages/mocha-chain/why).
- [mocha-typescript](https://www.npmjs.com/package/mocha-typescript) and similar class-based wrappers give tests typed fields through decorators and class instances. mocha-chain keeps Mocha's functional style, and needs no decorators.
- Vitest's [test context](https://vitest.dev/guide/test-context) (`test.extend`) types fixtures for Vitest. [vitest-chain](/packages/vitest-chain/) brings the hook-based style to Vitest instead.

## Related

<ProjectRelated />
