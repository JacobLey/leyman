# e2e-unknown-error-comparison

Runs unknown-error and the libraries it is compared to through the same edge cases, to keep its comparison table accurate.

[`unknown-error`](../../tools/unknown-error)'s README, [WHY file](../../tools/unknown-error/WHY-UNKNOWN-ERROR.md) and [docs page](../../docs/src/unknown-error/why.md) compare it to `ensure-error`, `normalize-exception`, `serialize-error`, `pony-cause` and a typical hand-written conversion. Each cell of that table is a test here, asserting what the library does today.

When a test fails after a dependency update, the library's behaviour changed: update the expected outcome in [`comparison.spec.ts`](./test/integration/comparison.spec.ts), and the tables to match.

It is not published, and has no source of its own: only tests.
