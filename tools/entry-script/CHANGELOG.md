# Change Log

## 3.0.3

### Patch Changes

- 1de1659: Omit CHANGELOG from publish
- 725510a: Include npmignore ignore file
- Updated dependencies [1de1659]
- Updated dependencies [725510a]
  - default-import@2.0.1

## 3.0.2

### Patch Changes

- Updated dependencies [2bef161]
  - default-import@2.0.0

## 3.0.1

### Patch Changes

- Updated dependencies [c5b98b0]
  - default-import@1.1.7

## 3.0.0

### Major Changes

- f9e63fa: Single run method instead of lifecycle management

### Patch Changes

- 4cbcb04: Handle electron argv
- 6467d6f: Expose error type for failure to implement main()
- 31f81fa: Internal dependency updates
- 3e7ee18: Dependency bumps
- f6a4729: Update year in LICENSE
- 9c786d0: Update dependencies
- 5984ed5: Add references to haywire-launcher
- Updated dependencies [31f81fa]
- Updated dependencies [3e7ee18]
- Updated dependencies [f6a4729]
- Updated dependencies [9c786d0]
  - default-import@1.1.6

## 2.1.0

### Added

Expose `run()` method for executing script lifecycle directly, in cases where the "executable" is not actually exported at the top-level.

## 2.0.0

### Changed

[`StaticEmitter`](https://www.npmjs.com/package/static-emitter) has been updated to extend `EventTarget` rather than `EventEmitter`, for environment-agnostic usage.

This comes with a slight change to the event declaration/emitting interface, which is a breaking change.
