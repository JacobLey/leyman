# unknown-error

## 0.1.1

### Patch Changes

- 7e4c3b2: `homepage` points at the package's docs site page, which the README links too.
- 2939d32: Document in the README how `NonError` messages describe each kind of value, which properties `toError` copies, and the exported option and node types.

## 0.1.0

### Minor Changes

- 10e4fe6: Initial release: `toError`, `getErrorMessage`, `hasCode` and `NonError` to turn any caught value into a real Error without throwing, and `walkErrors` and `formatError` to walk and print `cause` chains and `AggregateError` entries.
