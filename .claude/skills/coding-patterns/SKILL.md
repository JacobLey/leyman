---
name: coding-patterns
description: Coding patterns and conventions (package design, types, DI, docs)
---

# Coding Patterns

This document covers the soft rules and conventions of this codebase. Hard rules — formatting, import ordering, lint errors — are enforced automatically by Biome and ESLint (see [`./claude/skills/linting-formatting/SKILL.md`](../linting-formatting/SKILL.md)). Everything here is about judgment, not automation.

---

## Package design: small and composable

Packages should have a narrow, well-defined scope. When a natural extension of a package exists, make it a separate package that builds on the first rather than expanding the original.

Good examples in this repo:
- `juniper` builds JSON schemas → `juniper-validator` wraps them with a StandardSchema interface
- `haywire` is a DI container → `entry-script` is a CLI entry pattern → `haywire-launcher` connects the two
- `populate-files` writes files → `load-populate-files` adds a config-file loader on top

A package that does too many things is harder to test, harder to document, and harder to depend on selectively. When in doubt, split.

---

## Documentation: explain the why, not the what

Document any logic that isn't immediately obvious.
Assume a reader who understands TypeScript and general programming — a `for` loop needs no comment, but *why* that for loop has to recompute a value every pass should get documented.
What needs a comment is *why* a particular approach was chosen, especially if a naive alternative would seem equally valid.

This applies at multiple levels:
- **Inline comments** for non-obvious implementation choices
- **README.md** for public API usage and behaviour
- **WHY-\<PACKAGE\>.md** for motivation and design rationale (see [`.claude/skills/writing-readmes/SKILL.md`](../writing-readmes/SKILL.md))
- **SKILL.md files** for conventions, workflows, and context that agents or contributors need

If you write a workaround, a subtle ordering constraint, or a counter-intuitive data structure, leave a comment. Future readers (and agents) will thank you.

---

## Prefer immutability

Favour data that cannot be accidentally mutated. In practice:

- Use `readonly` on class fields and constructor parameters where the value won't change
- Use `ReadonlySet` and `ReadonlyMap` for collections exposed beyond their creation site
- Use `as const` on literal objects and arrays
- Use `readonly` array types (`readonly T[]` or `ReadonlyArray<T>`) for parameters that shouldn't be mutated
- Prefer returning new values over mutating in place

Immutability makes code easier to reason about — especially in a codebase with heavy type inference — because state changes are explicit and traceable.

---

## Dependency injection: when to use it, when not to

Use `haywire` when a class or function has dependencies that need to vary between production and test — file system access, network calls, console output, timestamps, random values.

Do **not** use DI everywhere by default. If a dependency is always the same real implementation and you never need to substitute it, just import it directly. Over-engineering with DI adds indirection with no benefit.

External consumers of a package should never be aware of its DI setup. The container wiring is an internal implementation detail. Expose a clean, non-DI API at the package boundary.

See the haywire README for the constructor provider pattern used in this repo.

---

## TypeScript: model data precisely

Use the type system as a design tool, not just a documentation aid. Specific guidance:

- **Avoid `unknown`, `object`, and `any`** except where truly warranted (e.g. a generic serialisation boundary). Prefer precise types.
- **Discriminated unions** are a first-class feature. An exhaustive `switch` on a discriminant is both runtime-correct and statically verified. Use them for state machines and variant types.
- **`unique symbol` declarations** serve as nominal type brands — use them to differentiate structurally identical types at compile time (see haywire's `HaywireId` and juniper's schema types).
- **Generic constraints** over `any` casts. When a function works across types, express that with generics rather than widening to `any`.
- **`exactOptionalPropertyTypes`** is enabled. An optional property (`field?: T`) is distinct from a property that can be `undefined` (`field: T | undefined`). Be deliberate.
- **`noUncheckedIndexedAccess`** is enabled. Array and object index access returns `T | undefined`, not `T`. Handle the undefined case.

---

## Function signatures: simple vs structured

For simple functions, a flat signature is fine:

```ts
function formatFile(filePath: string): Promise<void>
function clamp(value: number, min: number, max: number): number
```

Once a function has many parameters, especially optional ones, switch to a structured params/options split:

```ts
function findImport(
    fileNames: string | string[],
    options?: {
        cwd?: string | URL;
        direction?: 'up' | 'down';
        startAt?: string | URL;
    }
): Promise<{ filePath: string; content: unknown } | null>
```

The rule of thumb: if a call site reads as `foo('path', null, false, true, 3)` with no obvious meaning for each positional argument, restructure it. Required parameters first, optional parameters in a trailing `options` object.

---

## Private fields: `#` over `private`

Use JavaScript's native private field syntax (`#field`) rather than TypeScript's `private` keyword. Native private fields are enforced at runtime, not just at the type level — they cannot be accessed even via `as any` casts or `Object.keys`. This makes them genuinely encapsulated.

```ts
// Prefer
class Barrel {
    readonly #readFile: ReadFile;
    readonly #glob: Glob;
}

// Avoid
class Barrel {
    private readonly readFile: ReadFile;
    private readonly glob: Glob;
}
```

If you need to access private fields for testing or mocking, that is a sign of poor code setup. Refactor with DI, or pull the logic into separate code. Remember that "public" logic internal to a package doesn't necessarily have to impact the external API surface area (e.g. util files in a /src/lib directory that are not re-exported)

---

## Custom errors: named hierarchy

When defining errors, extend from a package-specific abstract base class and always set `.name` explicitly:

```ts
export abstract class HaywireError extends Error {}

export class HaywireDuplicateOutputError extends HaywireError {
    public readonly outputIds: GenericHaywireId[];
    public constructor(outputIds: GenericHaywireId[]) {
        super(`Duplicate output identifier: ${stringifyIds(outputIds)}`);
        this.name = 'HaywireDuplicateOutputError';
        this.outputIds = outputIds;
    }
}
```

The abstract base lets callers catch all errors from a package with a single `instanceof` check. Setting `.name` ensures the error displays correctly in logs and stack traces (otherwise it shows as `Error`). Attach structured data as typed properties rather than encoding everything in the message string.

---

## Prefer named exports

Named exports are easier for code completion and implicitly recommends unambiguous variable names for importers.

Default exports are acceptable in the case of dependents expecting a "single" export, such a `entry-script` and `load-populate-files` will
dynamically import a file and process the default export.

---

## Internal import aliases

For packages with many internal modules, use the `imports` field in `package.json` to define path aliases:

```json
{
  "imports": {
    "#binding": "./dist/lib/binding.js",
    "#identifier": "./dist/lib/identifier.js"
  }
}
```

This avoids deep relative paths (`../../../../lib/foo.js`) and makes internal refactoring easier. Use this when a package has more than a handful of internal cross-dependencies.

---

## Type-only imports

Always use `import type` when importing only types. This is enforced by the linter, but worth understanding why: it ensures the import is fully erased at compile time, prevents accidental circular dependency issues, and makes the module graph explicit.

```ts
import type { GenericBinding } from '#binding';
import { createModule } from '#module'; // has runtime value — plain import
```

---

## Tests: first-class code, not an afterthought

Tests are part of the package. They are read, reviewed, and maintained just like production code — write them accordingly.

**One concern per test.** Each test should assert one logical thing. If you find yourself adding a second set of assertions for a different behaviour, write a second test. A test that covers too much is hard to name, hard to diagnose on failure, and discourages future additions.

**Don't over-assert.** Only assert what the test is actually about. Checking incidental details (exact error message wording, internal call counts, unrelated return fields) makes tests fragile — they break when irrelevant things change. Assert the contract, not the implementation.

**No conditionals.** A test with an `if` or `switch` has two paths, meaning it's really two tests — or one is never exercised. The exception is when a conditional is the actual subject of the test (e.g. testing a type guard or a branch in business logic by running two separate tests that each take one path).

**Use assertion libraries for exceptional behaviour.** Don't `try/catch` manually to assert that something throws:

```ts
// Avoid
try {
    doThing();
    expect.fail('should have thrown');
} catch (err) {
    expect(err).to.be.instanceOf(MyError);
}

// Prefer
await expect(doThing()).to.be.rejectedWith(MyError);
expect(() => doThing()).to.throw(MyError);
```

**Readable test names.** A test name should read as a plain-English statement of the expected behaviour. Someone scanning a failure report should understand what broke without opening the file.

---

## Tests: type assertions alongside value assertions

Tests verify both runtime behaviour and TypeScript types. Use `expect-type` alongside Chai:

```ts
import { expect } from 'chai';
import { expectTypeOf } from 'expect-type';

test('returns correct type', () => {
    const result = findImport(['config.json']);
    expectTypeOf(result).toEqualTypeOf<Promise<{ filePath: string; content: unknown } | null>>();
    // ... await and chai assertions
});
```

Type assertions catch regressions where the runtime value is correct but the inferred type silently widened or narrowed.

---

## Parallelism: Promise.all over sequential awaits

When multiple async operations are independent, run them in parallel:

```ts
// Prefer
const [biome, prettier] = await Promise.all([canUseBiome(), canUsePrettier()]);

// Avoid
const biome = await canUseBiome();
const prettier = await canUsePrettier();
```

This applies to both production code and tests. Sequential awaits that could be parallel are a silent performance issue.

---

## `satisfies` over `as`

`as` in Typescript can sometimes make small tweaks to a type that are unintentional (if intentional, do `as unknown as TYPE`).

The `satisfies` keyword ensures types are correct and abide by some contract without actually re-typing the object.
