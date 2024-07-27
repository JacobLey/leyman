<div style="text-align:center">

# entry-script
Modular control for entry script execution.

[![npm package](https://badge.fury.io/js/entry-script.svg)](https://www.npmjs.com/package/entry-script)
[![License](https://img.shields.io/npm/l/entry-script.svg)](https://github.com/JacobLey/leyman/blob/main/tools/entry-script/LICENSE)

</div>

## Contents
- [Introduction](#introduction)
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [EntryScript](#entryscript)
    - [main(argv: string[]): Promise<void>](#mainargv-string-promise)
- [References](#references)

## Introduction

Modular control for entry script execution.

Many top-level NodeJS executables look something like:

```ts
// bin.ts
import express from 'express.js';
import { database } from './my-database.js';
import { middleware } from './my-middleware.js';

await database.connect();

const app = express();
app.use(middleware);

app.listen(3000);
```

This file is not testable, extendable, or modular because it executes the moment it is loaded. It is not possible to stub methods like `database.connect` in a test suite.

`entry-script` solves this by providing a light class to extend and export as default. The internals of `EntryScript` detect that the class is the top-level script, and kicks off the process.

But during a test environment where it is _not_ the top-level script, nothing is executed! That allows you to mock and inspect methods as necessary to fully test your code.

## Install

```sh
npm i entry-script
```

## Example

```ts
// my-app.ts
import { EntryScript } from 'entry-script';
import express, { type Application } from 'express';
import { database } from './my-database.js';
import { middleware } from './my-middleware.js';

/**
 * Class will be picked up by unit/integration tests to
 * provide mock dependencies
 */
export class MyApp extends EntryScript {

    #app: Application;
    #database: typeof database;

    constructor(application = express(), db = database) {
        this.#app = application;
        this.#database = db;
    }

    // node ./my-app.js --port 8080
    public override async main([, port = '8080']: string[]): Promise<void> {
        await database.connect();

        app.use(middleware);

        app.listen(parseInt(port));

        await new Promise((resolve, reject) => {
            // Graceful shutdown
            process.once('SIGTERM', () => {
                resolve();
            });
        });

        await database.disconnect();
    }
}

// Instance will be picked up when this file is executed directly!
export default new MyApp();
```

Now executing `node ./my-app.js` will start the server as expected!

But `import MyApp from './my-app.js';` will return the app class that is ripe for unit/integration testing!

## Usage

`entry-script` is an ESM module. That means it _must_ be `import`ed. To load from a CJS module, use dynamic import `const { EntryScript } = await import('entry-script');`.

Any class that extends `EntryScript` must export either the class itself or an instance of the class as the `default` export.

Depending on class/instance export, either the static or instance version of `main(argv: string[]): Promise<void>` must be implemented.

## API

### EntryScript

Extendable class that control logic flow of an entry point. Will not perform any execution if the entry point for nodejs does not export a child class of EntryScript as `default`.

This class is exported both as the default export of this package, and as a named export.

#### main(argv: string[]): Promise<void>

Available as both a static and instance method.

If a class is exported, will call the static method, if an instance is exported will call the instance method. Only one will be called, and it _must_ be implemented.

In general this method should not be called directly during production, as it is called implicitly by the internal EntryScript lifecycle, although it may be called as part of your unit/integration tests (thats the whole idea!).

The array of parameters passed to it are the command line arguments. T
hey are the same as `process.argv`, minus the node executable and filename:

`node ./foo-bar.js --port 8080` -> `argv = ['--port', '8080']`.

## References

See the [haywire](https://www.npmjs.com/package/haywire) package as a way to help manage dependency injection alongside instance creation.

```ts
import { EntryScript } from 'entry-script';
import { bind, createContainer } from 'haywire'; 
import { myModule } from './module.js';

const container = createContainer(myModule);

export default container.get(EntryScript);
```