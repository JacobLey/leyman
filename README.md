# Leyman README

An Nx monorepo for various libraries and plugins.

It is _highly_ recommended when developing locally to use a devcontainer. This will ensure your environment is set up correctly, and not risk interfering with any other settings or packages you may have configured across your desktop.

The [.devcontainer](./.devcontainer) directory is fully set up. If you open this repo in VSCode, you should immediately see an option to open it up in DevContainer.

## Concepts

[PNPM](https://pnpm.io/) is used for package management. It is highly efficient for sharing disk space while allowing packages to manage dependencies separately.

[Nx](https://nx.dev/) is used for task running. It manages the required prerequisite steps (e.g. building dependencies) with caching to simplify workflows.

A majority of the code written here is developed with [Typescript](https://www.typescriptlang.org/) targeting a [Node](https://nodejs.org/) ESM executable. Conceptually it is not restricted to only that, and could support other languages as well. No raw Javascript should be be used if Typescript is a viable alternative. CommonJS should be avoided unless explicitly required by consomers. Even then, lightly wrapping ESM with libraries like [CommonProxy](./tools/common-proxy/) are preferable to maintaining a full CommonJS codebase.

[Eslint](https://eslint.org/) enforces highly opinionated linting of Typescript files, to both catch issues and enforce a consitent coding style.

[Biome](https://biomejs.dev/) enforces Typescript and JSON formatting. It is an optimized replacement for Prettier.

This repo is designed to be used in a [DevContainer](https://code.visualstudio.com/docs/devcontainers/containers). This ensures all your runtimes and configurations are properly set up by default, and won't pollute the rest of your workspace.

## Getting Started

"Global" packages are installed automatically if using a dev container, but if not see the [Dockerfile](./.devcontainer/Dockerfile) for list of dependencies (e.g. Node and pnpm).

Run `pnpm i` to get started.

From there, run `nx run <package-name>:<task>`. See [Nx documetation](https://nx.dev/nx-api/nx/documents/run) for more details.

Many tasks are broken down into subtasks to manage the various steps required. For example a typescript build script may perform some codegen before generating the final `.js` files. See the [nx-lifecyle](./apps/nx-lifecycle) package to see how we manage this!

Some standard tasks are:
- build
  - Generates executable output code
- analyze
  - Applies linters/formatters
- test
  - Runs full test suite for package

Try running `nx run-many -t test` to build, analyze, and test the entire package!

See individual packages for documentation.

## Known issues

There are a few known issues that impact this monorepo as a whole (per-package issues are tracked separately):

- Nx does not maintain dependency graph for target overloads
  - https://github.com/nrwl/nx/issues/26929
  - Workaround is to explicitly copy `dependsOn` to all targets

## Contributing

All changes should include a [changeset](https://www.npmjs.com/package/@changesets/cli) file that reports how packages are impacted.

Simply run `changeset` once you are done and follow the instructions in the CLI.
Then include the generated file in your commit.