<div style="text-align:center">

# nx-update-ts-references
An [Nx](https://nx.dev/) plugin that updates your [tsconfig.json references](https://www.typescriptlang.org/tsconfig/#references) based on your local dependencies.

[![npm package](https://badge.fury.io/js/nx-update-ts-references.svg)](https://www.npmjs.com/package/nx-update-ts-references)
[![License](https://img.shields.io/npm/l/nx-update-ts-references.svg)](https://github.com/JacobLey/leyman/blob/main/tools/nx-update-ts-references/LICENSE)

</div>

## Table of Contents

* [Introduction](#introduction)
* [Usage](#usage)
* [API](#api)
    * [check](#check)
    * [dryRun](#dryrun)

## Introduction

When working with typescript in a monorepo, you can use the [references](https://www.typescriptlang.org/tsconfig/#references) field of tsconfig.json to point to packages that your code depends on locally, so Typescript can efficently build and infer types as your codebase grows.

Nx already manages a dependency graph of your local typescript packages based on the dependencies on your `package.json`.

`nx-update-ts-references` will use this dependency graph to ensure your typescript configuration is up to date, so you don't have to manage it manually.

## Installation

`npm i nx-update-ts-references`

Register it as a target in your `project.json`:
```json
{
    "targets": {
        "update-ts-references": {
            "executor": "nx-update-ts-references:update-ts-references"
        }
    }
}
```

## Usage

Due to Nx deriving the dependency graph from your `package.json`, and the rest of the fields of `tsconfig.json` being maintained, those are the only two inputs, and the `tsconfig.json` file is the out, this is a trivially cacheable operation:

```json
{
    "targets": {
        "update-ts-references": {
            "executor": "nx-update-ts-references:update-ts-references",
            "cache": true,
            "inputs": [
                "{projectRoot}/package.json",
                "{projectRoot}/tsconfig.json"
            ],
            "outputs": [
                "{projectRoot}/tsconfig.json"
            ],
        }
    }
}
```

It is recommended to include this in every project that is based on typescript.

## API

The following options can be passed to the [options](https://nx.dev/reference/project-configuration#executorcommand-options) object.

### check

`boolean`

When true, target will fail if the `tsconfig.json` is out of sync from the desired state.

Defaults to false when executing locally, but defaults to true when running in CI environments. Useful for enforcing that any updates to package dependencies are reflected in the version-controlled code prior to deployment.

### dryRun

`boolean`

When true, will not actually write the `tsconfig.json` file. Can still fail if [check](#check) is true.

Defaults to false.