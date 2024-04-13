<div style="text-align:center">

<h1>entry-script</h1>
<p>Modular control for entry script execution.</p>

[![npm package](https://badge.fury.io/js/entry-script.svg)](https://www.npmjs.com/package/entry-script)
[![License](https://img.shields.io/npm/l/entry-script.svg)](https://github.com/JacobLey/leyman/blob/main/common/config/publish/LICENSE)
[![Quality](https://img.shields.io/npms-io/quality-score/entry-script.svg)](https://github.com/JacobLey/leyman/blob/main/tools/entry-script)

</div>

## Contents
- [Introduction](#introduction)
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)

<a name="Introduction"></a>
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

<a name="Install"></a>
## Install

```sh
npm i entry-script
```

<a name="Example"></a>
## Example

```ts
// my-app.ts
import { EntryScript, runtimeError } from 'entry-script';
import express from 'express';
import { database } from './my-database.js';
import { middleware } from './my-middleware.js';

/**
 * All method overrides are optional!
 * Only fill in what you need
 */
export default MyApp extends EntryScript {

    /**
     * Override this method to provide async setup/loading logic
     */
    public static async create() {
        await database.connect();
        return new MyApp(process.env.PORT);
    }

    /**
     * Attach any custom parameters to instance
     */
    constructor(port) {
        super();
        this.port = port;

        // Handle uncaught errors
        this.on(runtimeError, () => {
            process.exitCode = 1;
        });
    }

    /**
     * Override this method for core app logic.
     */
    public async start() {
        const app = express();
        app.use(middleware);

        app.listen(this.port);

        // Also an event emitter!
        this.emit('Listening!', this.port);

        return new Promise((resolve, reject) => {
            // Graceful shutdown
            process.once('SIGTERM', () => {
                resolve();
            });
        });
    }

    /**
     * Override this method to perform any cleanup logic, regardless if `start` threw an error.
     */
    public async finish() {
        await database.disconnect();
    }
}
```

Now executing `node ./my-app.js` will start the server as expected!

But `import MyApp from './my-app.js';` will return the app class that is ripe for unit/integration testing!

<a name="Usage"></a>
## Usage

`entry-script` is an ESM module. That means it _must_ be `import`ed. To load from a CJS module, use dynamic import `const { EntryScript } = await import('entry-script');`.

Any class that extends `EntryScript` must export itself as the `default` export.

The `EntryScript` itself extends [StaticEmitter](https://www.npmjs.com/package/static-emitter) for event emitting convenience.

<a name="Api"></a>
## API

### EntryScript

Extendable class that control logic flow of an entry point. Will not perform any execution if the entry point for nodejs does not export a child class of EntryScript as `default`.

#### run

Available on both the class and instance. Controls script lifecycle.

In general this method should not be called directly, as it is called implicitly by the internal EntryScript lifecycle.

May be called manually when the script is not exposed as the top-level default export.

```ts
class MyScript extends EntryScript {
    public start() {
        // Do stuff...
    }
}

// Creates the script and executes
await MyScript.run();

// Create the script manually and execute.
const myScript = await MyScript.create();
await myScript.run();
```

#### Methods to override

Each method can call `super.<method>()` as desired, but the base methods are very basic, often NOOP, logic.

##### create

Async static method.

Perform any "pre-execution" logic here, such as loading configs or connecting to databases.

Must return an instance of the class, either by calling `return new MyClass()` directly, or `return super.create()`.

##### constructor

Normal class constructor.

Customize the properties of the class as appropriate.

##### start

Async instance method.

Perform most of the business logic here. Once this promise resolves, cleanup will be initialized.

So long-running tasks like servers should return a dangling promise, one that is perhaps only resolved on signal interrupts.

##### finish

Async instance method.

Perform any "post-execution" logic here, such as disconnecting from databases, or writing final data to disk.

This will be called regardless of the "success" of the `start` script.

### runtimeError

Symbol that will be used as event key on the `EntryScript` instance whenever `start` throws an error.

Listening on this event is optional, but recommended for handling unexpected cleanup, or taking options such as setting a failing exit code.
