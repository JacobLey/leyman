---
description: The EntryScript class, the Main interface, and MainNotImplementedError.
---

# API

entry-script is ESM only. From CommonJS, load it with a dynamic import: `const { EntryScript } = await import('entry-script');`.

## `EntryScript`

Abstract base class of an entry script. Also the default export.

```ts
import EntryScript from 'entry-script';
// or
import { EntryScript as Named } from 'entry-script';
```

| Method | Description |
|--------|-------------|
| `main(argv: string[]): Promise<void>` | Runs the script, when the module's default export is an instance. |
| `static main(argv: string[]): Promise<void>` | Runs the script, when the module's default export is the class. |

Implement one of them. The other throws `MainNotImplementedError`.

`argv` is the command-line arguments after the script path: `node script.js --port 8080` passes `['--port', '8080']`. Electron apps are handled too, where `process.argv` has no separate binary.

`main` is called once, when Node was started with the module (or with a module that re-exports it as its `default`). An error it throws is an unhandled rejection, so Node prints it and exits with code 1.

## `Main`

```ts
import type { Main } from 'entry-script';
```

Anything with a `main(argv: string[]): Promise<void>` method. [haywire-launcher](/packages/haywire-launcher/) accepts any `Main` from a container, not only `EntryScript` subclasses.

## `MainNotImplementedError`

Thrown by the `main` (or `static main`) that a subclass didn't implement.
