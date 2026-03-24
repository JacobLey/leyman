<div style="text-align:center">

# Why mocha-chain?

</div>

## The Problem

Mocha's `beforeEach` hook is the standard way to set up fresh state before each test. But using it with TypeScript reveals a tension between type safety and test isolation.

### `beforeEach` forces unsafe variable declarations

The natural pattern is to declare a variable in the suite scope, assign it in `beforeEach`, and use it in tests:

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

TypeScript knows `division` could be `null` — it was declared that way. So every test has to assert non-null with `!`, or cast the type, or initialize with a fake value. The type annotation lies: the variable is always set by test time, but nothing in the type system reflects that guarantee.

### Hoisting the variable out doesn't help for mutable state

The obvious fix is to construct once and share:

```ts
const division = new Division();
```

Now the type is clean. But this only works for immutable values. The moment the object has state — a database connection, a Sinon mock, a per-test counter — sharing it across tests means one test can corrupt another.

### Per-test construction without hooks violates DRY

You could construct inside each test body:

```ts
test('success', () => {
    const division = new Division();
    expect(division.divide(12, 3)).to.equal(4);
});
```

But this loses everything that makes hooks useful: setup runs once per context, teardown is guaranteed even on failure, and shared setup logic lives in one place.

---

## The Solution

`mocha-chain` lets hooks return values that are passed forward as typed context. Instead of a shared mutable variable in the outer scope, each hook returns an object and the next hook or test receives it as a parameter:

```ts
const withDivision = beforeEach(() => {
    return { division: new Division() };
});

withDivision.test('success', ({ division }) => {
    expect(division.divide(12, 3)).to.equal(4);
});
```

- `division` is always `Division`, never `Division | null`
- No `!` assertions, no unsafe casts
- Each test gets a fresh instance from the hook, isolated from every other test
- Teardown hooks (`afterEach`, `after`) receive the same context, so cleanup is type-safe too

→ [Back to README](./README.md)
