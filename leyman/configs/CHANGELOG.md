# @leyman/configs

## 0.3.0

### Minor Changes

- 97cf632: `tsconfig.test.json` sets `rootDir` to the test folder and `outDir` to the `dist-test/` folder beside it, so a subpath import of compiled tests (`"#test/*": "./dist-test/*"`) type-checks against the test sources. Tests still emit nothing.

## 0.2.1

### Patch Changes

- ebb0dbb: Rewrite the README to introduce the package in plainer prose.

## 0.2.0

### Minor Changes

- d20634b: Ships the framework's principles as a skill, `skills/principles/SKILL.md`, so a coding agent reads the principles of the version installed. pnpm links it into an agent's skills once approved, which `@leyman/nx-plugin`'s `init` does.

## 0.1.0

### Minor Changes

- 13eae67: First public release: tsconfig bases for Node.js 22 and 24 support floors and for tests, plus SWC, c8, Biome and Vitest configs.
