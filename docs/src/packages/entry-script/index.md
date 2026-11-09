---
description: Write a Node.js script whose main() only runs when it is the entry point, so tests can import it without side effects.
---

# entry-script

<ProjectHeader />

A script that does its work as soon as the file loads (connecting to a database, say) can't be imported by a test without that work happening too. With entry-script, the work goes in a `main()` method that only runs when Node was started with that file, so importing the script from a test is safe.

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

- A test can construct the class with test doubles and call `main()` with the arguments it wants.
- `main()` receives only the command-line arguments, without the Node binary and script path.
- You can export an instance and implement `main`, or export the class and implement `static main`.
- [haywire-launcher](/packages/haywire-launcher/) builds the script from a [Haywire](/packages/haywire/) container, only when it runs.

## Compared to

- `if (import.meta.url === pathToFileURL(process.argv[1]).href)`, or CommonJS's `require.main === module`, checks the same thing by hand in every script, and breaks when the entry point is a different file that re-exports the script (like a `bin.mjs` shim).
- Node.js's newer [`import.meta.main`](https://nodejs.org/api/esm.html#importmetamain) is only true in the entry module itself, so a script re-exported by a shim still needs care. entry-script finds the entry point's default export, wherever it was defined.

## Related

<ProjectRelated />
