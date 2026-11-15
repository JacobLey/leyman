# Why mocha-chain?

## The problem

Mocha's `beforeEach` hook is the standard way to set up fresh state before each test. With TypeScript, though, it makes you choose between type safety and test isolation.

### `beforeEach` forces unsafe variable declarations

The natural pattern is to declare a variable in the suite scope, assign it in `beforeEach`, and use it in tests:

<!-- twoslash
declare class Division {
    divide(dividend: number, divisor: number): number;
}
declare const expect: (actual: unknown) => { to: { equal: (expected: unknown) => void } };
declare const suite: (title: string, fn: () => void) => void;
declare const beforeEach: (fn: () => void) => void;
declare const test: (title: string, fn: () => void) => void;
-->
```ts
suite('Division.divide', () => {

    let division: Division | null = null;

    beforeEach(() => {
        division = new Division();
    });

    test('success', () => {
        expect(division!.divide(12, 3)).to.equal(4);
    });
});
```

TypeScript knows `division` could be `null`, since it was declared that way. So every test has to assert non-null with `!`, cast the type, or initialize the variable with a fake value. The variable is always set by the time a test runs, but its type doesn't say so.

### Hoisting the variable out doesn't help for mutable state

The obvious fix is to construct once and share:

<!-- twoslash
declare class Division {
    divide(dividend: number, divisor: number): number;
}
declare const expect: (actual: unknown) => { to: { equal: (expected: unknown) => void } };
declare const suite: (title: string, fn: () => void) => void;
declare const beforeEach: (fn: () => void) => void;
declare const test: (title: string, fn: () => void) => void;
-->
```ts
const division = new Division();
```

Now the type is clean, but this only works for immutable values. Once the object has state (a database connection, a Sinon mock, a per-test counter), sharing it across tests means one test can corrupt another.

### Per-test construction without hooks violates DRY

You could construct inside each test body:

<!-- twoslash
declare class Division {
    divide(dividend: number, divisor: number): number;
}
declare const expect: (actual: unknown) => { to: { equal: (expected: unknown) => void } };
declare const suite: (title: string, fn: () => void) => void;
declare const beforeEach: (fn: () => void) => void;
declare const test: (title: string, fn: () => void) => void;
-->
```ts
test('success', () => {
    const division = new Division();
    expect(division.divide(12, 3)).to.equal(4);
});
```

But this gives up what hooks are for. A hook keeps shared setup in one place and runs it once per context, and teardown hooks run even when a test fails.

## The solution

`mocha-chain` lets hooks return values that are passed forward as typed context. Instead of a shared mutable variable in the outer scope, each hook returns an object and the next hook or test receives it as a parameter:

<!-- twoslash
declare class Division {
    divide(dividend: number, divisor: number): number;
}
import { expect } from 'chai';
import { beforeEach } from 'mocha-chain';
-->
```ts
const withDivision = beforeEach(() => {
    return { division: new Division() };
});

withDivision.test('success', ({ division }) => {
    expect(division.divide(12, 3)).to.equal(4);
});
```

`division` is typed `Division` rather than `Division | null`, so the test needs no `!` assertion or cast. Each test still gets a fresh instance from the hook, and the teardown hooks (`afterEach`, `after`) receive the same context, so cleanup is type-safe too.

[vitest-chain](https://www.npmjs.com/package/vitest-chain) solves the same problem for Vitest.
