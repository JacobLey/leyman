---
description: Install entry-script, write a script's main(), run it, and test it without running it on import.
---

# Getting started

## Install

::: code-group

```sh [npm]
npm i entry-script
```

```sh [pnpm]
pnpm add entry-script
```

```sh [yarn]
yarn add entry-script
```

:::

::: tip
entry-script requires Node.js 24 or later, and is ESM only.
:::

## Write a script

Extend `EntryScript`, implement `main`, and export an instance as the module's `default`. Take dependencies through the constructor, with the real ones as defaults:

```ts
interface Database {
    connect(): Promise<void>;
    count(): Promise<number>;
}
declare const database: Database;
// ---cut---
// count-users.ts
import { EntryScript } from 'entry-script';

export class CountUsers extends EntryScript {
    readonly #db: Database;

    public constructor(db: Database = database) {
        super();
        this.#db = db;
    }

    public override async main([format = 'text']: string[]): Promise<void> {
        await this.#db.connect();
        const count = await this.#db.count();
        console.log(format === 'json' ? JSON.stringify({ count }) : `${count} users`);
    }
}

export default new CountUsers();
```

Run it with `node count-users.js json`: `main` receives `['json']`, the arguments after the script path.

## When `main` runs

When Node starts, entry-script imports the script Node was started with (`process.argv[1]`), and calls `main` on its default export, if that's an `EntryScript` instance or subclass. Importing the module from anywhere else does nothing.

- The check is on the entry point's default export, wherever it was defined. A `bin.mjs` that only does `export { default } from './dist/cli.js';` runs the script it re-exports.
- An error thrown by `main` is an unhandled rejection: Node prints it and exits with code 1.
- Exactly one of `main` and `static main` must be implemented. Calling the other throws `MainNotImplementedError`.

## Test it

Import the class, pass test doubles to the constructor, and call `main` with the arguments to test. Nothing ran when the module was imported:

```ts
interface Database {
    connect(): Promise<void>;
    count(): Promise<number>;
}
declare class CountUsers {
    constructor(db?: Database);
    main(argv: string[]): Promise<void>;
}
// ---cut---
const fakeDb: Database = { connect: async () => {}, count: async () => 3 };

// Prints {"count":3}
await new CountUsers(fakeDb).main(['json']);
```

## Exporting the class

A script that needs no instance can export the class, and implement `static main`:

```ts
import { EntryScript } from 'entry-script';

export default class Version extends EntryScript {
    public static override async main(): Promise<void> {
        console.log('1.0.0');
    }
}
```

## Next steps

- [haywire-launcher](/haywire-launcher/): build the script from a dependency injection container, only when it runs.
- [API reference](/entry-script/reference/api).
