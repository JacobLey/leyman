<div style="text-align:center">

# load-populate-files
Load and dynamically populate file content based on a single files config.

[![npm package](https://badge.fury.io/js/load-populate-files.svg)](https://www.npmjs.com/package/load-populate-files)
[![License](https://img.shields.io/npm/l/load-populate-files.svg)](https://github.com/JacobLey/leyman/blob/main/tools/load-populate-files/LICENSE)

</div>

## Table of Contents

* [Introduction](#introduction)
* [Installation](#installation)
* [Usage](#usage)
* [API](#api)
    * [loadAndPopulateFiles](#loadandpopulatefilesfilepath-options)
* [Also See](#also-see)

## Introduction

`load-populate-files` is a small library to simplify usage of [populate-files](https://www.npmjs.com/package/populate-files), which will dynamically write files based on calculated content.

Instead of calling `populateFiles()` directly, we can can export the file configs, and defer the execution of file writing to `loadAndPopulateFiles()`.

This is useful for CLI scripts, or NX plugins like [nx-populate-files](https://www.npmjs.com/package/nx-populate-files).

## Installation

`npm i load-populate-files`

Populate-files is an ESM module. That means it _must_ be `import`ed. To load from a CJS module, use dynamic import `const { loadAndPopulateFiles } = await import('load-populate-files');`.

## Usage

Provide the file path to a file that _default exports_ the parameters for `populateFiles()`

Options are supported the same as `populateFiles()`.

```ts
// config.ts
export default [
    {
        filePath: './foo.json',
        content: { bar: 123 },
    },
    {
        filePath: './abc.js',
        content: `
            console.log('Hello World!');
        `,
    },
];

// index.ts
await loadAndPopulateFiles('./config.js');
```

## API

### loadAndPopulateFiles(filePath, options)

Loads the config specified at `filePath`, and passes that to [populateFiles()](https://www.npmjs.com/package/populate-files#populatefilesparams-options).

The loaded file may either be a single object config, or an array of separate configs.

#### options

An optional object as the secondary parameter. Passed to underlying `populateFiles()` call.

| property | type | default | description |
|----------|------|---------|-------------|
| check | `boolean` | `true` if in a CI environment. Else `false` | If `true`, will fail if writing the file would result in changing the files content. Useful for CI environments to make sure the version-controlled code is up to date before deployment. |
| dryRun | `boolean` | `false` | If `true`, will not write file regardless of changes. Can still fail if `check` is `true`. |
| cwd | `string \| URL` | `process.env.PWD` | Used as the current working directory if `filePath` is a relative file. Will be re-used in filePaths derived from loaded config |

## Also See

### [parse-cwd](https://www.npmjs.com/package/parse-cwd)

Used internally to interpret `cwd` option.

### [populate-files](https://www.npmjs.com/package/populate-files)

Populate and format a file based on dynamic content.

### [nx-populate-files](https://www.npmjs.com/package/nx-populate-files)

Load and populate files as an nx target.