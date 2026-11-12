# @leyman/eslint-config

## 0.4.0

### Minor Changes

- ca72e92: import-x now resolves imports with its own resolver, and follows TypeScript sources: `./file.js` finds `./file.ts`, as TypeScript's `nodenext` resolution does. It no longer loads the optional peer `eslint-import-resolver-node`, so `import-x/no-cycle` no longer crashes where that isn't installed (`autoInstallPeers: false`). Rules that resolve imports, such as `import-x/no-cycle` and `import-x/no-relative-parent-imports`, now check TypeScript imports they used to skip, so they may report errors that were there all along.

## 0.3.0

### Minor Changes

- 5b06d1c: `configGenerator` returns a promise, and only a package that depends on `react` loads and applies the React, React Hooks and JSX a11y plugins. A config that spreads the result needs `...(await configGenerator({ ... }))`. A package without React no longer loads about 2,200 modules on every lint, and `n/no-top-level-await` is off for `eslint.config.js`.

## 0.2.1

### Patch Changes

- ebb0dbb: Rewrite the README to introduce the package in plainer prose.

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
