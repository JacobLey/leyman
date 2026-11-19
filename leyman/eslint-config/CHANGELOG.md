# @leyman/eslint-config

## 0.5.2

### Patch Changes

- a9bf2f2: `import-x/no-cycle` no longer follows imports into installed packages (`ignoreExternal`), which can't import a package's own files and so can't be part of a cycle. Following them parsed everything they import: linting a package that imports TypeScript took 15 s and 2.9 GB for 17 files, now 6 s and 760 MB. Workspace packages are still followed.

## 0.5.1

### Patch Changes

- 7b0c8d9: Update dependencies: @typescript-eslint/eslint-plugin@8.72.2, @typescript-eslint/parser@8.72.2, @typescript-eslint/utils@8.72.2. 8.72.2 fixes `prefer-string-starts-ends-with`'s autofix on `v`-flag regular expressions.

## 0.5.0

### Minor Changes

- e478481: `curly` (in its `all` style), `no-unexpected-multiline` and `unicorn/template-indent` are on. eslint-config-prettier, which the config applies last, turned them off along with the formatting rules, though a formatter doesn't fight them, so `unicorn/template-indent`'s `{ indent: 4 }` never applied.
- 6a8d4c4: Replace the deprecated rules still on with their maintained successors. `multiline-comment-style` and `spaced-comment` become `@stylistic/multiline-comment-style` and `@stylistic/spaced-comment` from `@stylistic/eslint-plugin`, with the same options. `@typescript-eslint/sort-type-constituents` becomes `perfectionist/sort-union-types` and `perfectionist/sort-intersection-types` from `eslint-plugin-perfectionist`, with the same order of kinds. Within a kind, members now sort naturally ignoring whitespace, so some unions need reordering: number literals come before string literals (`0 | ''`), a string before the longer strings it starts (`'date' | 'date-time'`), and a multi-line object or tuple type no longer sorts first for its line break. An intersection with a function or constructor type keeps its order, which can change the type, where the old rule sorted it too. Only these four rules of the two plugins are on.

### Patch Changes

- 4d43fed: `capitalized-comments` no longer reports Biome 2's suppression comments: `biome-ignore lint/<group>/<rule>: ...`, `biome-ignore-all`, `biome-ignore-start` and `biome-ignore-end`.
- d4bcc10: CommonJS files (`.cjs`, `.cts`) may use `require`, as the README says: `import-x/no-commonjs`, `sonarjs/no-require-or-define` and `n/prefer-process-get-builtin-module` no longer report it there.
- 564f4bf: JavaScript files are linted without type information, wherever they are: a `.js` file outside the package root and outside `tsconfig.json` no longer fails to parse. Where a type-aware typescript-eslint rule is off for JavaScript, the core rule it replaces now takes its setting rather than a bare `'error'`: `require-await` stays off, and `prefer-destructuring` keeps `array: false` for assignments. `@typescript-eslint/explicit-function-return-type`, `explicit-module-boundary-types` and `explicit-member-accessibility`, which JavaScript can't satisfy, are off for it.
- 91e6dea: eslint-plugin-n's rules (`n/no-unsupported-features/*`...) check against the same Node.js floor as the rest of the config. For a package without `engines`, that is the running Node.js and newer, where eslint-plugin-n fell back to Node.js 16 and reported APIs the package can use.
- 0cff1ac: `baseNamingConvention` drops a second public `typeProperty` entry allowing PascalCase, which never applied: the entry before it has the same selector and modifiers, and `@typescript-eslint/naming-convention` uses the first match. Type properties stay camelCase or snake_case, as they were.
- af9772a: The React, React Hooks and JSX accessibility rules are off for JavaScript files too, as for `.ts`: only `.tsx` files get them.

## 0.4.1

### Patch Changes

- 55962db: Require eslint-plugin-import-x `~4.18.0`, which accepts minimatch 11 (with its pattern amplification fix) where 4.17 needed minimatch 10. The four rules 4.18 added that contradict the config (`avoid-barrel-files`, `avoid-importing-barrel-files`, `avoid-namespace-import` and `avoid-re-export-all`) stay off.

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
