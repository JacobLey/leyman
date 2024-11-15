<div style="text-align:center">

# pnpm-dedicated-lockfile
Generate a lockfile that only contains dependencies of a single package.

[![npm package](https://badge.fury.io/js/pnpm-dedicated-lockfile.svg)](https://www.npmjs.com/package/pnpm-dedicated-lockfile)
[![License](https://img.shields.io/npm/l/pnpm-dedicated-lockfile.svg)](https://github.com/JacobLey/leyman/blob/main/apps/pnpm-dedicated-lockfile/LICENSE)

</div>

## Contents
- [Introduction](#introduction)
- [Install](#install)
- [Example](#example)
- [Usage](#usage)

## Introduction

[pnpm](https://pnpm.io/) is a package manager than greatly assists working with monorepo. It stores a manifest of all installed packages in a single file `.pnpm-lock.yaml` at the root of your workspace. This is necessary for pNpm to manage all dependencies in one place, with appropiate caching and shared references.

However this means it is difficult to tell when changes in an installed dependency impact a given package.

When you have CI jobs that are based on caching, updating a single dependency can trigger _every_ job to re-run, which is slow and expensive.

Instead, you can calculate a single lockfile for a given package, and perform caching based on that.

`pnpm-dedicated-lockfile` is a CLI that writes this dedicated lockfile to your package.

Note that while this file is directly based on `.pnpm-lock.yaml` and has a similar format, it is _not_ an actual lockfile and is not interchangeable with `.pnpm-lock.yaml`. Instead it should only be used for caching, and for visually inspecting dependency impacts to a given package.

## Install

```sh
npm i pnpm-dedicated-lockfile --save-dev
```

## Example

```sh
npx pnpm-dedicated-lockfile --projectDir ./path/to/package
```

Will write a file at `./path/to/package/.pnpm-lock`.

## Usage

`npx pnpm-dedicated-lockfile --help` to get started.

It is generally recommended to only include `pnpm-dedicated-lockfile` as a dev/test dependency.
The resulting files may be checked into version control. They are as deterministic as `.pnpm-lock.yaml`, but since they may only be used for caching, it is not strictly necessary.

| flag | type | default | description |
|------|------|---------|-------------|
| `--projectDir` | `string` | `.` | Directory containing package to calculate dedicated lockfile. |
| `--hash` | `boolean` | `false` | Write a SHA hash instead of a large JSON file. This has benefits of reduced file size, but may more easily result in collisions. |
| `--lockfile-name` | `string` | `.pnpm-lock` | Update the file name to whatever you prefer. |
| `--omit-comment` | `boolean` | `false` | Exclude the `// DO NOT EDIT` comment at top of file. |
| `--omit-links` | `boolean` | `false` | Exclude dependencies that are only related to local workspace links (e.g. `workspace:^` specifiers). They are included by default |
| `--dry-run` | `boolean` | `false` | Don't actually create/update the files. |
| `--ci` | `boolean` | If is CI environment | If existing file is out-of-date, throws an error. Make sure to explicitly set as false if not checking files into version control. |
