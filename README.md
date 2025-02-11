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

## Executing Dagger

This repository is currently undergoing a migration to [Dagger](https://dagger.io/) for CI builds. It will continue to use Nx locally, but will use that metadata to produce much more reliable builds.

All dagger functions are contained in the [/dagger](./dagger) directory.

To get started, run `dagger call --mod ./dagger/test-and-build/ --source . run`

To replicate local Nx builds (build project -> test it -> build dependents -> ...)
the [nx-dagger](./apps/nx-dagger/) executor is used to autogenerate a [monorepo Dagger function](./dagger/monorepo/main.go).

To re-generate that file, edit any relevant settings in [nx-dagger.json](./leyman/main/nx-dagger.json), and run `nx run @leyman/main:dagger`.

You may hook up your own Dagger cloud account (`dagger login`) for better view of execution pipeline and debugging.

It is still highly recommended to run `nx run-many -t test` _before_ trying to execute dagger.
Any issues like linter or build failures will materialize much faster with Nx, at the cost of greater dependency on global installations and less deterministic caching.
If it works on Nx, it _isn't_ guaranteed to work in CI, but if it works in Dagger it will work on CI!

## Contributing

All changes should include a [changeset](https://www.npmjs.com/package/@changesets/cli) file that reports how packages are impacted.

Simply run `changeset` once you are done and follow the instructions in the CLI.
Then include the generated file in your commit.