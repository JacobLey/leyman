# @leyman/eslint-config

## 0.2.0

### Minor Changes

- ee0b74b: Update dependencies: @tanstack/react-query@5.105.0, eslint@10.14.0, globals@17.13.0, @typescript-eslint/eslint-plugin@8.72.1, @typescript-eslint/parser@8.72.1, @typescript-eslint/utils@8.72.1, eslint-plugin-regexp@3.3.2.
- 5e7e91f: Ships a skill for coding agents, `skills/eslint-config/SKILL.md`: the `configGenerator` options, what each directory is held to, when and how to disable a rule, and where to run ESLint from.

### Patch Changes

- a65f397: `unicorn/prefer-iterator-concat` stays off on a Node.js 26 floor: TypeScript's lib doesn't declare `Iterator.concat` yet, so the call it asks for doesn't type-check.

## 0.1.1

### Patch Changes

- 2148704: Leave off the rules eslint-plugin-import-x 4.18 adds that contradict the config: `avoid-namespace-import` (namespace imports are allowed), and `avoid-barrel-files`, `avoid-importing-barrel-files` and `avoid-re-export-all` (a package's entry point is a barrel of its API). Before this, 4.18 turned them on as errors.
  
  The plugins, `@eslint/js` and typescript-eslint now take `~` ranges, so a plugin's new rules only reach you with a release of this package.

## 0.1.0

### Minor Changes

- e3e0ba7: First public release: the ESLint flat config of the leyman monorepo, generated from each package's `package.json`. Supports Node.js 24.15 and newer. React's version is detected from the installed package when the package depends on React, rather than fixed.
