---
description: Describe generated files in a module, and write or check them with the load-populate-files CLI.
---

# Config modules and the CLI

`load-populate-files` loads the files to write from a module, and passes them to [`populateFiles`](/packages/populate-files/reference/api#populatefiles-params-options). The module holds only *what* to generate; the CLI (or a script, or an Nx target) decides where and when.

::: code-group

```sh [npm]
npm i -D load-populate-files
```

```sh [pnpm]
pnpm add -D load-populate-files
```

```sh [yarn]
yarn add -D load-populate-files
```

:::

## Write a config module

The module's default export is one file, or an array of them, with the same params as [`populateFile`](/packages/populate-files/reference/api#params). Use `satisfies` to check it at compile time:

```ts
// src/file-content.ts
import type { PopulateFileParams } from 'load-populate-files';

const routes = ['/', '/about', '/blog'];

export default [
    { filePath: 'routes.json', content: routes },
    {
        filePath: 'sitemap.txt',
        content: `${routes.map(route => `https://example.com${route}`).join('\n')}\n`,
    },
] satisfies PopulateFileParams[];
```

The module is loaded with `import()`, so it must be JavaScript that Node can run: point the CLI at the compiled file. Anything the module imports runs as usual, so it can build content from your own code. For example, [nx-lifecycle](/packages/nx-lifecycle/) writes its JSON Schemas from the [Juniper](/packages/juniper/) schemas it validates with, so the published schema can't drift from the code.

A default export that isn't a valid config fails with `File content does not fulfill populate-file input at: <path>`, followed by a line for each problem, such as `- filePath: must have required property 'filePath'`.

## Run the CLI

```sh
npx load-populate-files --file-path ./dist/file-content.js --target-dir ./generated
```

File paths in the config are resolved from `--target-dir`, which is resolved from `--cwd`. Like `populateFiles`, it checks instead of writing in CI, and `--ci` or `--no-ci` choose yourself:

```sh
load-populate-files --file-path ./dist/file-content.js --ci     # fail if out of date
load-populate-files --file-path ./dist/file-content.js --no-ci  # write, even in CI
```

See the [CLI reference](/packages/populate-files/reference/cli) for every flag.

## From code

```ts
import { loadAndPopulateFiles } from 'load-populate-files';

const results = await loadAndPopulateFiles(
    { filePath: './dist/file-content.js' },
    { targetDir: './generated', clean: true }
);
```

It takes the same [options](/packages/populate-files/reference/api#options) as `populateFiles`, and returns its results.

## In an Nx workspace

Run it as a cached target after the module is compiled, and before anything that reads the output:

```json
// nx.json
{
    "targetDefaults": {
        "populate-files": {
            "executor": "nx:run-commands",
            "options": {
                "command": "load-populate-files --file-path ./dist/file-content.js --target-dir ./out --manifest ./out/.generated.json --clean",
                "cwd": "{projectRoot}"
            },
            "dependsOn": ["build"],
            "cache": true,
            "inputs": ["{projectRoot}/src/**/*"],
            "outputs": ["{projectRoot}/out"]
        }
    }
}
```

With [nx-lifecycle](/packages/nx-lifecycle/), bind the target to a stage instead of writing `dependsOn` by hand. See [Stages and hooks](/packages/nx-lifecycle/guides/stages-and-hooks).

The [manifest](/packages/populate-files/guides/manifest) lets `--clean` share `out/` with other files, and catches hand edits to the JSON. Exclude it from the published package, e.g. with `"!out/.generated.json"` in `package.json` `files`.
