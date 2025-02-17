# Change Log

## 2.0.8

### Patch Changes

- 2dfcf0d: Refactor dependencies to not require pnpmfile
- 9694f33: Bump dependencies

## 2.0.7

### Patch Changes

- 282a5b7: Bump license version
- 75d9ae4: Migrate to using per-package eslint CLI instead of Nx plugin

## 2.0.5

### Patch Changes

- 18cfe17: Add dev dependency on pnpm-dedicated-lockfile
- efd163f: Remove local files from publishing
- 37b2ec5: Move from nx-tsc to swc + tsc CLI
- 36d1c12: Bump dependencies

## 2.0.4

### Patch Changes

- e718f38: Update dependencies

## 2.0.3

### Patch Changes

- bcd9e61: Bump dependencies

## 2.0.2

### Patch Changes

- 3b3f77f: Bump dependencies
- 3285cb6: Bump biome version
- 9b58c82: Bump typescript version

## 2.0.1

### Patch Changes

- 1de1659: Omit CHANGELOG from publish
- 725510a: Include npmignore ignore file

## 2.0.0

### Major Changes

- 2bef161: Stop supporting Node<20

The [current active version](https://nodejs.org/en/about/previous-releases#release-schedule) is 20.
So long as you keep up with NodeJS releases, there are no other breaking changes with this release.

## 1.1.7

### Patch Changes

- c5b98b0: Revert node engines to original value
  https://github.com/JacobLey/leyman/issues/1

## 1.1.6

### Patch Changes

- 31f81fa: Internal dependency updates
- 3e7ee18: Dependency bumps
- f6a4729: Update year in LICENSE
- 9c786d0: Update dependencies

## 1.1.0

### Added

Better type inference of "true" default import. The input type of `defaultImport` is now just a plain generic, and the response is explicitly calculated in the return-type.

Before response was auto-inferred based on various input shapes, which was not always reliable.

### Changed

Internally tests now assert the type of the response, as well as actual JS response (via [expect-type](https://www.npmjs.com/package/expect-type) and [Chai](https://www.npmjs.com/package/chai)).
