<div style="text-align:center">

# nx-tsc
Nx plugin for transpiling typescript files.

[![npm package](https://badge.fury.io/js/nx-tsc.svg)](https://www.npmjs.com/package/nx-tsc)
[![License](https://img.shields.io/npm/l/nx-tsc.svg)](https://github.com/JacobLey/leyman/blob/main/tools/nx-tsc/LICENSE)

</div>

## Contents

- [Introduction](#introduction)
- [Usage](#usage)
- [API](#api)

## Introduction

Running the default `@nx/tsc` plugin can result in issues if your config setup does not perfectly match what is expected.

This plugin is a light wrapper around native typescript's `tsc` command for type checking, and `swc` for actual file output.

## Usage

Include it as a target in your `project.json`.

Has a [peer dependency](https://nodejs.org/en/blog/npm/peer-dependencies) on [typescript](https://www.npmjs.com/package/typescript) so make sure that is installed as well. This package is generally tested with the latest version.

```json
{
  "name": "my-package",
  "targets": {
    "tsc": {
      "executor": "nx-tsc:build",
      "options": { "tsConfig": "{projectRoot}/tsconfig.json" }
    },
  }
}
```

This script will load from the specified `tsconfig.json`, and specified [rootDir](https://www.typescriptlang.org/tsconfig/#rootDir). It will output to the [outDir](https://www.typescriptlang.org/tsconfig/#outDir).

It is _highly_ recommended to take advantage to Nx's [inputs](https://nx.dev/reference/inputs) and [outputs](https://nx.dev/recipes/running-tasks/configure-outputs) to take advantage of task caching.

## API

### build

Builds the typescript files in local project, outputting `.js` files and 

#### Options:
| name | type | required | default | description |
|------|------|---------|----------|-------------|
| tsConfig | sring | true | ❌ | Path to `tsconfig.json`. Respects internal extensions.