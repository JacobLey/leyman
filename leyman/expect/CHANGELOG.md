# @leyman/expect

## 0.1.2

### Patch Changes

- ebb0dbb: Rewrite the README to introduce the package in plainer prose.

## 0.1.1

### Patch Changes

- a66d307: Require Node.js 22.12.0 or later (`engines.node` was `>=22`). 22.12.0 is the oldest Node.js where the test runner starts, since mocha needs `require()` of ES modules, so it is the oldest version the package is tested on. Nothing changed for Node.js 22.12 and later.

## 0.1.0

### Minor Changes

- e3e0ba7: First public release: Chai's `expect` and `assert` with chai-as-promised registered. Supports Node.js 22 and newer.
