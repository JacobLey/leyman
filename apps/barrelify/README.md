<div style="text-align:center">

<h1>barrelify</h1>
<p>Auto-generate TS barrel files.</p>

[![npm package](https://badge.fury.io/js/barrelify.svg)](https://www.npmjs.com/package/barrelify)
[![License](https://img.shields.io/npm/l/barrelify.svg)](https://github.com/JacobLey/leyman/blob/main/apps/barrelify/LICENSE)
[![Quality](https://img.shields.io/npms-io/quality-score/barrelify.svg)](https://github.com/JacobLey/leyman/blob/main/apps/barrelify)

</div>

## Contents
- [Introduction](#introduction)
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)

<a name="Introduction"></a>
## Introduction

Auto-generate barrel files for typescript.

Scans your directories for `index.ts` files with the `// AUTO-BARREL` comment at the start.
Then re-writes the files as a barrel of all other javascript files in the directory.

Respects CommonJS/ESM compatibilities. Always ignores `.gitignore`-d and `node_modules` files.

Barrel files _should_ be checked into version control.

<a name="install"></a>
## Install

```sh
npm i barrelify --save-dev
```

<a name="example"></a>
## Example

Given file structure
```
/
├─┬ cjs
│ ├── package.json // { "type": "commonjs" }
│ ├── cts.cts
│ ├── ts.ts
│ ├── esm.mts
│ └── index.ts // AUTO-BARREL
├─┬ esm
│ ├── package.json // { "type": "module" }
│ ├── cts.cts
│ ├── ts.ts
│ ├── esm.mts
│ └── index.ts // AUTO-BARREL
└─┬ ignore
  ├── foo.ts
  └── index.ts // _not_ AUTO-BARREL
```

`npx barrelify` will rewrite:

/cjs/index.ts:
```ts
// AUTO-BARREL

export * from './cts.cjs';
export * from './ts.js';
```

/esm/index.ts:
```ts
// AUTO-BARREL

export * from './cts.cjs';
export * from './ts.js';
export * from './esm.mjs';
```

Note that the `// AUTO-BARREL` comment is preserved, so future `npx barrelify` will continue to keep files in sync.

<a name="Usage"></a>
## Usage

`barrelify` is an ESM module. That means it _must_ be `import`ed. To load from a CJS module, use dynamic import `const { barrelify } = await import('barrelify');`.

It is also available as a CLI.

`npx barrel --help` to get started.

It is generally recommended to only include `barrelify` as a dev/test dependency.

Make sure your index files are flagged with `// AUTO-BARREL` as the very first characters in the file. It will not generate index files by itself.

`npx barrel --ci` will execute a special "dry-run" version, that throws an error if any files are found out of sync. This can ensure barrel files are properly generated _before_ checking into version control, or during CI tests.

<a name="Api"></a>
## API

### barrelify(options?)

Programmatic way to access `barrelify`. Performs same actions as CLI.

#### options

##### cwd
string (default = process.cwd())

Directory to start search for index files. Defaults/resolves from process.cwd().

Recursively checks directories starting from this point.

##### dryRun
boolean (default = false)

If true, will not actually perform file writes.

##### ignore
string[] (default = [])

Globs for index files that should be explicitly ignored.
