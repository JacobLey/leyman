<div style="text-align:center">

# @leyman/eslint-config

An ESLint flat config for TypeScript ESM packages with nearly every rule on and a reason given for each exception, generated from each package's package.json.

[![npm package](https://badge.fury.io/js/@leyman%2Feslint-config.svg)](https://www.npmjs.com/package/@leyman/eslint-config)
[![License](https://img.shields.io/npm/l/@leyman/eslint-config.svg)](https://github.com/JacobLey/leyman/blob/main/leyman/eslint-config/LICENSE)

</div>

`@leyman/eslint-config` turns on every non-deprecated rule of ESLint and of ten plugins (typescript-eslint, import-x, jsdoc, n, regexp, sonarjs, unicorn, React, React Hooks and JSX accessibility) as an error. The rules are read from the installed plugins, so a new rule is on as soon as this package takes the plugin release that adds it. Each rule that is turned off or configured has a comment saying why.

The config is generated from the package's `package.json`. Its workspace dependencies are treated as internal imports, rules that suggest APIs the package's oldest supported Node.js (`engines.node`) lacks are turned off, and the React rules depend on whether the package uses React. typescript-eslint's type-checked rules run through its project service, so there is no `parserOptions.project` to maintain.

All formatting rules are off, so Biome or Prettier can handle formatting.

It is the config of the [leyman](https://github.com/JacobLey/leyman) monorepo, published as-is. Expect it to be strict and to change (see [Versioning](#versioning)).

## Contents

- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
- [Versioning](#versioning)
- [Known issues](#known-issues)

## Install

```sh
npm i -D @leyman/eslint-config eslint typescript
```

`eslint` (10) and `typescript` (a version typescript-eslint supports) are peers.

The package ships a skill for coding agents, `skills/eslint-config/SKILL.md`: the options, what each directory is held to, and when to disable a rule. pnpm (12.11 or later) links it into your agent's skills once you approve it: `pnpm approve`, or `'@leyman/eslint-config': { skills: true }` under `permissions` in `pnpm-workspace.yaml`.

## Example

`eslint.config.js` next to the package's `package.json` and `tsconfig.json`:

```js
import configGenerator from '@leyman/eslint-config';
import packageJson from './package.json' with { type: 'json' };

export default configGenerator({ configUrl: import.meta.url, packageJson });
```

Then run `eslint .` from the package directory.

## Usage

The package is ESM only. The config returned is a flat config array, so you change it by appending your own entries, as with any flat config.

It expects this layout, per package:

| Path                                                   | What the config does with it                                                                                                                         |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsconfig.json`                                        | Found by typescript-eslint's project service from each file, for type-aware rules. Plain `.js` files outside it are linted without type information. |
| `src/`                                                 | Published code: importing a `devDependency` is an error here. `src/cli.ts` and `src/commands/**` may use `console`.                                  |
| `test/`                                                | Tests: Node.js globals, and rules that get in the way of tests (magic numbers, return types, `@ts-expect-error`...) are off.                         |
| `**/eslint/**`                                         | ESLint plugin code: visitors named after AST nodes and kebab-case rule names are allowed.                                                            |
| `coverage`, `dist`, `dist-test`, `out`, `node_modules` | Ignored.                                                                                                                                             |

`.tsx` files get the React, React Hooks and JSX accessibility rules, and the other files don't. CommonJS files (`.cjs`, `.cts`) may use `require`.

A disable comment needs a description (`// eslint-disable-next-line rule -- why`), and one that no longer suppresses anything is reported.

## API

### `configGenerator(params)`

The default export. Returns a promise of the flat config (`Linter.Config[]`) for one package, which ESLint takes as a config file's default export. A package that depends on React gets the React, React Hooks and JSX a11y plugins, loaded only then.

Await it to extend the config: `...(await configGenerator({ ... }))`.

| Parameter     | Type                       | Default | Description                                                                                                                                                                                                                                               |
| ------------- | -------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `configUrl`   | `string`                   | —       | Required. `import.meta.url` of the package's `eslint.config.js`. typescript-eslint resolves `tsconfig.json` from its directory.                                                                                                                           |
| `packageJson` | `unknown`                  | —       | Required. The package's `package.json`, loaded. Must have a `name`; `engines.node`, if present, must start with `>=`.                                                                                                                                     |
| `node`        | `boolean`                  | `false` | Whether the package's code only runs on Node.js. By default only the globals Node.js shares with browsers (`fetch`, `URL`, `console`...) are defined, so code meant to run elsewhere can't use `process` or `Buffer` by accident. Tests always have them. |
| `plugins`     | `readonly ESLint.Plugin[]` | `[]`    | ESLint plugins shipped by your own packages, each turned on with its flat `configs.recommended` rules outside `test/`. Each needs `meta.namespace`.                                                                                                       |

**Rejects** with `Error` when `packageJson` isn't an object with a `name`, or `engines.node` doesn't name a floor; a `TypeError` when a plugin has no `meta.namespace` or no flat `configs.recommended`.

What it reads from `packageJson`:

| Field                                                | Effect                                                                                                                                                                                                                             |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`, and dependencies with a `workspace:` version | Treated as internal imports by `import-x`.                                                                                                                                                                                         |
| `engines.node`                                       | Its major version is the package's floor. Rules that suggest a newer API (`unicorn/prefer-regexp-escape` before Node.js 24...) are off below the Node.js version that has it. Without `engines`, the running Node.js is the floor. |
| `react` in any dependency field                      | React's version is detected from the installed package.                                                                                                                                                                            |

### `nonDeprecatedRules(name, plugin)`

Every non-deprecated rule of `plugin` that applies to JavaScript, as `'error'`, prefixed with `name/`. The config builds each plugin's rules with it, and you can use it to turn on another plugin the same way.

### `baseNamingConvention`, `reactComponentNamingConvention`

The options passed to `@typescript-eslint/naming-convention`, the second only in `.tsx` files. Spread them into your own entry to extend the convention rather than replace it.

### `@leyman/eslint-config/package-json-schema`

`packageJsonSchema` (the JSON Schema the `packageJson` parameter is checked against), `assertIsPackageJson` and the `PackageJson` type.

## Versioning

Before 1.0, a release that can make passing code fail (a new rule, a stricter option) is a minor, and other changes are patches.

Every rule a plugin ships is on, so the plugins (and `@eslint/js` and typescript-eslint) are dependencies with `~` ranges: a plugin's patch releases reach you, but its minors, which add rules, only come with a release of this package, once each new rule is decided. Other dependencies take `^`.

## Known issues

- In typescript-eslint 8.72, `@typescript-eslint/prefer-string-starts-ends-with` misreads regular expressions with the `v` flag, and its autofix can change behavior. For example, `/^\p{N}/v.test(s)` becomes `s.startsWith('p{N}')`. Since `regexp/require-unicode-sets-regexp` (which is on) moves every regular expression to the `v` flag, you are likely to run into it. The fix ([typescript-eslint#13102](https://github.com/typescript-eslint/typescript-eslint/pull/13102)) is merged but not yet released. Until it is, leyman applies [a patch](https://github.com/JacobLey/leyman/blob/main/patches/@typescript-eslint__eslint-plugin@8.72.1.patch) (pnpm's `patchedDependencies`); run `--fix` with care on `v`-flag expressions, or apply the same patch.
