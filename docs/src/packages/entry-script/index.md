---
description: Write a Node.js script whose main() only runs when it is the entry point, so tests can import it without side effects.
---

# entry-script

Write a Node.js script whose `main()` only runs when it's the entry point, so tests can import it without side effects.

```ts
import { EntryScript } from 'entry-script';

export class Greet extends EntryScript {
    public override async main([name = 'world']: string[]): Promise<void> {
        console.log(`Hello, ${name}!`);
    }
}

export default new Greet();
```

`node greet.js Ada` prints `Hello, Ada!`. A test that imports `Greet` gets the class, and nothing runs until it calls `main()` itself.

**[Get started →](/packages/entry-script/getting-started)**

## Features

- **No side effects on import**: a script's work happens in `main()`, which only runs when Node was started with that file.
- **Testable**: construct the class with test doubles, and call `main()` with the arguments you want.
- **Arguments without the noise**: `main()` receives the command-line arguments only, without the Node binary and script path.
- **Class or instance**: export an instance and implement `main`, or export the class and implement `static main`.
- **With dependency injection**: [haywire-launcher](/packages/haywire-launcher/) builds the script from a [Haywire](/packages/haywire/) container, only when it runs.

## Compared to

- `if (import.meta.url === pathToFileURL(process.argv[1]).href)`, or CommonJS's `require.main === module`, checks the same thing by hand in every script, and breaks when the entry point is a different file that re-exports the script (like a `bin.mjs` shim).
- Node.js's newer [`import.meta.main`](https://nodejs.org/api/esm.html#importmetamain) is only true in the entry module itself, so a script re-exported by a shim still needs care. entry-script finds the entry point's default export, wherever it was defined.
