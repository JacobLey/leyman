---
description: Install haywire-launcher, bind a CLI class in a Haywire container, and launch it from a bin file.
---

# Getting started

## Install

::: code-group

```sh [npm]
npm i haywire haywire-launcher entry-script
```

```sh [pnpm]
pnpm add haywire haywire-launcher entry-script
```

```sh [yarn]
yarn add haywire haywire-launcher entry-script
```

:::

::: tip
[haywire](/packages/haywire/) and [entry-script](/packages/entry-script/) are peer dependencies. All three are ESM only.
:::

## Launch a class from a container

Write the CLI as a class with a `main(argv)` method, taking its dependencies through its constructor. Bind it in a [Haywire](/packages/haywire/) container like any other class, and pass the container and the class (or its id) to `launch()`:

```ts
import type { Main } from 'entry-script';
import { bind, createContainer, createModule } from 'haywire';
import { launch } from 'haywire-launcher';

class Greeter {
    greet(name: string): string {
        return `Hello, ${name}!`;
    }
}

class Cli implements Main {
    readonly #greeter: Greeter;

    public constructor(greeter: Greeter) {
        this.#greeter = greeter;
    }

    public async main([name = 'world']: string[]): Promise<void> {
        console.log(this.#greeter.greet(name));
    }
}

const container = createContainer(
    createModule(bind(Greeter).withConstructorFactory()).addBinding(
        bind(Cli).withDependencies([Greeter]).withConstructorProvider()
    )
);

export default launch(container, Cli);
```

`launch()` returns an [entry script](/packages/entry-script/) class right away, without touching the container. When Node runs the file, it gets `Cli` from the container with `getAsync()`, and calls `main()` with the command-line arguments.

Usually the container lives in its own module, and the bin file only launches it:

```ts
// @noErrors
// src/bin.ts
import { launch } from 'haywire-launcher';
import { Cli } from './cli.js';
import { container } from './container.js';

export default launch(container, Cli);
```

A `bin.mjs` shim, for `package.json`'s `bin`, can then re-export the compiled file: entry-script runs the default export of whatever file Node started with.

```js
#!/usr/bin/env node
export { default } from './dist/bin.js';
```

## Without an id

`launch(container)` gets `EntryScript` itself from the container, for a container that binds `EntryScript` to a subclass.

## Disposing the container

By default the container is never disposed: a `main()` often starts a server and returns while it keeps running, so `launch()` can't know when the program is done. For a script that is done once `main()` returns, pass `dispose: true`. The container's singletons are then released (pools closed, connections ended) when `main()` resolves or rejects:

```ts
// @noErrors
import { launch } from 'haywire-launcher';
import { Migrate } from './migrate.js';
import { container } from './container.js';

export default launch(container, Migrate, { dispose: true });
```

## Type errors

`launch()` checks the container and id at compile time, and the error says what's wrong:

- The container must be able to provide the id: `Error: the container has no binding for this id.`
- The id's type must have a main method: `Error: the id's type has no main(argv: string[]): Promise<void> method.`
- Without an id, the container must bind `EntryScript`, or the error suggests passing your class.

## Testing

Tests don't need `launch()`. Build the class with test doubles, or from a test container, and call `main()`:

```ts
import type { Main } from 'entry-script';
declare class Greeter {
    greet(name: string): string;
}
declare class Cli implements Main {
    constructor(greeter: Greeter);
    main(argv: string[]): Promise<void>;
}
// ---cut---
const greeter: Greeter = { greet: name => `Hi ${name}` };

await new Cli(greeter).main(['Ada']);
```

To test the wiring, `getOriginal()` on the launched class returns the instance the container builds.
