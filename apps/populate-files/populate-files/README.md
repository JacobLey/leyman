<div style="text-align:center">

# populate-files
Populate static files with dynamic content, and make sure they stay in sync.

[![npm package](https://badge.fury.io/js/populate-files.svg)](https://www.npmjs.com/package/populate-files)
[![License](https://img.shields.io/npm/l/populate-files.svg)](https://github.com/JacobLey/leyman/blob/main/tools/populate-files/LICENSE)

</div>

## Table of Contents

* [Introduction](#introduction)
* [Installation](#installation)
* [Usage](#usage)
* [API](#api)
    * [populateFile](#populatefileparams-options)
    * [populateFiles](#populatefilesparams-options)
* [Also See](#also-see)

## Introduction

`populate-files` is a small library to help populate a static file (like a `.json`) with dynamic calculated content. 
Perhaps loaded from an external source, or based off local changes.

It is a light wrapper around the [fs](https://nodejs.org/api/fs.html) module, which can ensure that the current state is not being overwritten.

## Installation

`npm i populate-files`

Populate-files is an ESM module. That means it _must_ be `import`ed. To load from a CJS module, use dynamic import `const { populateFiles } = await import('populate-files');`.

## Usage

Provide the file path and the file content, and the file will be updated.

Optionally specify that the file must be in sync, useful for enforcing files are in sync in a CI environment.

```ts
import { populateFile } from 'populate-files';

// Successfully writes json file!
await populateFile(
    {
        filePath: './foo.json',
        content: { bar: 123 },
    }
);

// Error! File has changed!
await populateFile(
    {
        filePath: './foo.json',
        content: { baz: 456 },
    },
    {
        check: true,
    }
);
```

## API

### populateFile(params, options)

Writes the provided content at file path.

#### params

A required object provided as first parameter.

| property | type | description |
|----------|------|-------------|
| filePath | `string` | Path to file to write (and check for existing content) |
| content | `string \| object \| Uint8Array \| Promise` | Data to be written to file. Strings and Uint8Array (like Buffers) will be written literally. An object will be `JSON.stringify`ed, and pretty-formatted accordiing to user configs. A Promise may be provided instead that resolves to one of these types. |

#### options

An optional object as the secondary parameter.

| property | type | default | description |
|----------|------|---------|-------------|
| check | `boolean` | `true` if in a CI environment. Else `false` | If `true`, will fail if writing the file would result in changing the files content. Useful for CI environments to make sure the version-controlled code is up to date before deployment. |
| dryRun | `boolean` | `false` | If `true`, will not write file regardless of changes. Can still fail if `check` is `true`. |
| cwd | `string \| URL` | `process.env.PWD` | Used as the current working directory if `params.filePath` is a relative file. |

### populateFiles(params, options)

Write multiple files in parallel.

#### params

A required list of [populateFile parameters](#params), with unique `filePath`s.

#### options

Same as [populateFile options](#options).

## Also See

### [format-file](https://www.npmjs.com/package/format-file)

Used internally to pretty-print stringified file content.

### [parse-cwd](https://www.npmjs.com/package/parse-cwd)

Used internally to interpret `cwd` option.

### [nx-populate-files](https://www.npmjs.com/package/nx-populate-files)

Load and populate files as an nx target.