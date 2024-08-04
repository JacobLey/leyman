<div style="text-align:center">

# nx-populate-files
Nx plugin to dynamically populate file content.

[![npm package](https://badge.fury.io/js/nx-populate-files.svg)](https://www.npmjs.com/package/nx-populate-files)
[![License](https://img.shields.io/npm/l/nx-populate-files.svg)](https://github.com/JacobLey/leyman/blob/main/tools/nx-populate-files/LICENSE)

</div>

## Table of Contents

* [Introduction](#introduction)
* [Usage](#usage)
* [API](#api)
    * [populateFile](#populatefileparams-options)
    * [populateFiles](#populatefilesparams-options)
* [Also See](#also-see)

## Introduction

`nx-populate-files` is an Nx plugin to write files based on dynamic content. Acts the same as calling [loadAndPopulateFiles](https://www.npmjs.com/package/load-populate-files) from your JS code.

## Usage

Register the `populate-files` executor and provide the `filePath` to the file that _default exports_ file content, matching the parameters to [populateFile()](https://www.npmjs.com/package/populate-files).

```ts
// src/config.ts

export default {
    filePath: './foo.json',
    content: { bar: 123 },
} satisfies PopulateFileParams;
```

`project.json`:
```json
{
    "targets": {
        "populate-files": {
            "executor": "nx-populate-files:populate-files",
            "options": {
                "filePath": "{projectRoot}/dist/config.js",
                "cwd": "{projectRoot}"
            }
        }
    }
}
```

If caching this target, it is recommended to include all the source files for your config as input, and declare the written files as output.

## executors

### populate-files

Loads the content at `filePath`, and writes the content for each set of params.

#### options

A required object.

| property | required | type | default value | description |
|----------|----------|------|---------------|-------------|
| filePath | ✅ | `string` | ❌ | Path to file that _default exports_ the config for content to populate files |
| check | ❌ | `boolean` | `true` if in a CI environment. Else `false` | If `true`, will fail if writing the files would result in changing the files content. Useful for CI environments to make sure the version-controlled code is up to date before deployment. |
| dryRun | ❌ | `boolean` | `false` | If `true`, will not write file regardless of changes. Can still fail if `check` is `true`. |
| cwd | ❌ | `string \| URL` | `process.env.PWD` | Used as the current working directory if `params.filePath` is a relative file. |

## Types

### PopulateFileParams

Type of the exported config at the specified file. Represents the parametesr to `populateFiles()`. It is highly recommended to combine with the `satisfies` keyword to ensure your exported config will succeed.

```ts
import type { PopulateFileParams } from 'nx-populate-files';

export default {
    filePath: './foo.json',
    content: { bar: 123 },
} satisfies PopulateFileParams;
```

Note this type can also be imported from [populate-files](https://www.npmjs.com/package/populate-files) and [load-populate-files](https://www.npmjs.com/package/load-populate-files) directly.

## Also See

### [populate-files](https://www.npmjs.com/package/populate-files)

Populate a file based on dynamic content, enforcing changes are complete in CI environments.

### [load-populate-files](https://www.npmjs.com/package/load-populate-files)

Load and populate files as a JS method.