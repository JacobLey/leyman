<div style="text-align:center">

# entry-script
Modular control for entry script execution.

[![npm package](https://badge.fury.io/js/entry-script.svg)](https://www.npmjs.com/package/entry-script)
[![License](https://img.shields.io/npm/l/entry-script.svg)](https://github.com/JacobLey/leyman/blob/main/tools/entry-script/LICENSE)

</div>

## Contents
- [The Problem](#the-problem)
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [EntryScript](#entryscript)
- [Also See](#also-see)

## The Problem

Many top-level NodeJS executables execute side effects the moment the file is loaded:

```ts
// bin.ts
import { database } from './my-database.js';
await database.connect();
```

This makes the file untestable — any import of it triggers real network calls, with no opportunity to mock dependencies. `entry-script` solves this by providing a base class to extend and export as `default`. The internals detect whether the module is the actual entry point: if so, execution proceeds; if imported by a test or another module, nothing runs.

## Install

```sh
npm i entry-script
```

## Example

Export the class when you want tests to inject mocked dependencies via the constructor:

```ts
// my-app.ts
import { EntryScript } from 'entry-script';
import express, { type Application } from 'express';
import { database } from './my-database.js';
import { middleware } from './my-middleware.js';

export class MyApp extends EntryScript {
    #app: Application;
    #database: typeof database;

    constructor(application = express(), db = database) {
        super();
        this.#app = application;
        this.#database = db;
    }

    // node ./my-app.js --port 8080
    public override async main([, port = '8080']: string[]): Promise<void> {
        await this.#database.connect();
        this.#app.use(middleware);
        this.#app.listen(Number.parseInt(port));

        await new Promise<void>(resolve => {
            process.once('SIGTERM', resolve);
        });

        await this.#database.disconnect();
    }
}

// Picked up when this file is the entry point
export default new MyApp();
```

Running `node ./my-app.js --port 8080` starts the server. Importing `MyApp` from a test gives you the class with no side effects.

Alternatively, export the class itself (not an instance) and implement the static form of `main`:

```ts
export class MyApp extends EntryScript {
    public static override async main(argv: string[]): Promise<void> {
        // ...
    }
}

export default MyApp;
```

## Usage

`entry-script` is an ESM module. It _must_ be `import`ed. To load from a CJS module, use dynamic import: `const { EntryScript } = await import('entry-script');`.

The `default` export of a module using `entry-script` must be either:
- An **instance** of an `EntryScript` subclass — the instance `main(argv)` method will be called.
- The **class** itself (an `EntryScript` subclass) — the static `main(argv)` method will be called.

Exactly one of the static or instance `main` must be implemented.

## API

### `EntryScript`

Base class for entry point modules. Extend it, implement `main`, and export the class or an instance as `default`. The class is available as both the default export and a named export.

```ts
import EntryScript from 'entry-script';
import { EntryScript } from 'entry-script';
```

#### `.main(argv): Promise<void>`

Available as both a **static** and an **instance** method.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `argv` | `string[]` | — | Required. Command-line arguments, equivalent to `process.argv` with the node executable and filename stripped. |

**Returns** `Promise<void>` — resolves when the script has finished executing.

The method to implement is determined by the export pattern:
- `export default new MyApp()` → implement the **instance** method.
- `export default MyApp` → implement the **static** method.

`main` is called implicitly by the `entry-script` lifecycle when the module is the entry point. During tests, call it directly on the class or instance to drive execution with controlled inputs.

`node ./my-app.js --port 8080` passes `argv = ['--port', '8080']`.

**Throws** `MainNotImplementedError` — if neither the static nor instance `main` has been overridden.

### `Main`

Interface satisfied by any class with a `main(argv: string[]): Promise<void>` method. Used by `haywire-launcher` and other integrations that accept arbitrary entry implementations.

```ts
import type { Main } from 'entry-script';
```

## Also See

- [`haywire-launcher`](https://www.npmjs.com/package/haywire-launcher) — combine dependency injection with entry-point handling using a haywire container
