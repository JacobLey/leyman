# unknown-error

## 0.2.2

### Patch Changes

- 9c82c6d: Rewrite the README (and WHY file, where there is one) to introduce the problem before the package, in plainer prose.

## 0.2.1

### Patch Changes

- a66d307: Require Node.js 22.12.0 or later (`engines.node` was `>=22`). 22.12.0 is the oldest Node.js where the test runner starts, since mocha needs `require()` of ES modules, so it is the oldest version the package is tested on. Nothing changed for Node.js 22.12 and later.

## 0.2.0

### Minor Changes

- 8461cca: On Node.js 22, which has no `Error.isError`, Errors are recognized by `instanceof Error` or their `[object Error]` tag, as in older browsers.
- 8461cca: Supports Node.js 22: `engines.node` is now `>=22`, down from `>=24`. The package uses no API newer than Node.js 22 has, and is built and tested against it.

## 0.1.1

### Patch Changes

- 7e4c3b2: `homepage` points at the package's docs site page, which the README links too.
- 2939d32: Document in the README how `NonError` messages describe each kind of value, which properties `toError` copies, and the exported option and node types.

## 0.1.0

### Minor Changes

- 10e4fe6: Initial release: `toError`, `getErrorMessage`, `hasCode` and `NonError` to turn any caught value into a real Error without throwing, and `walkErrors` and `formatError` to walk and print `cause` chains and `AggregateError` entries.
