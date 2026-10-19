---
description: Run a Haywire-built entry script in one line. The container is only built when the script runs, not when it's imported.
---

# haywire-launcher

Run a [Haywire](/haywire/)-built [entry script](/entry-script/) in one line. The container is only built when the script runs, not when it's imported.

```ts
// @noErrors
// bin.ts
import { identifier } from 'haywire';
import { launch } from 'haywire-launcher';
import { Cli } from './cli.js';
import { container } from './container.js';

export default launch(container, identifier(Cli));
```

`node bin.js` gets `Cli` from the container, with all its dependencies, and calls its `main()`. Importing `bin.js` does nothing, so tests can build their own container instead.

**[Get started →](/haywire-launcher/getting-started)**

## Features

- **No container on import**: `container.getAsync()` at a module's top level builds every dependency (and opens every connection) as soon as anything imports it. `launch()` waits until the script runs.
- **Checked at compile time**: a container that can't provide the id, or an id whose type has no `main(argv)`, is a type error.
- **Any `Main`**: the script can be any class with a `main(argv)` method, not only an `EntryScript` subclass.
- **Testable**: `getOriginal()` returns the instance the container builds, for testing the wiring itself.

Every CLI in this repository (barrelify, genever, nx-lifecycle, …) starts this way.
