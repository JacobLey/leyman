<div style="text-align:center">

# haywire-launcher
Instantiate and execute your script in one line.

[![npm package](https://badge.fury.io/js/haywire-launcher.svg)](https://www.npmjs.com/package/haywire-launcher)
[![License](https://img.shields.io/npm/l/haywire-launcher.svg)](https://github.com/JacobLey/leyman/blob/main/tools/haywire-launcher/LICENSE)

</div>

## Contents
- [Introduction](#introduction)
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [launch](#launchcontainer-id--entryscript)

## Introduction

[EntryScript](https://www.npmjs.com/package/entry-script) is a package that helps manage execution of a file at runtime, while making it easy to mock and test.

[Haywire](https://www.npmjs.com/package/haywire) is a type-safe dependency injection library that furthers the ability to mock and test interfaces.

Using them together, we can have our haywire container instantiate our entry script!
However, by default this comes with a couple problems that EntryScript was designed to solve in the first place.

We need to actually invoke instantiations of our container, which may trigger behavior that is not safe to run at test time.
It may also fail if the container internally has dependencies on credentials, environment variables, or network connections that don't exist in your local environment.
```ts
import EntryScript from 'entry-script';
import { myHaywireContainer } from './container.js';

// This potentially has side effects that are not safe locally!
export default myHaywireContainer.get(EntryScript);
```

Alternatively we can just use an EntryScript child class to perform the constructor instantiation. 
However this code isn't easy to test, without mocking the container (Haywire container types should not be mocked themselves) or invoking the container directly, which repeats the issue above.
```ts
import EntryScript from 'entry-script';
import { myHaywireContainer } from './container.js';

export default class extends EntryScript {
    public static override async main(argv: string[]): Promise<void> {
        // Test coverage of this code is hard!
        const entry = await myHaywireContainer.getAsync(EntryScript);
        return entry.main(argv);
    }
}
```

`HaywireLauncher` is the solution to this! Like all things Haywire, it continues to be type-safe!

## Install

```sh
npm i haywire-launcher
```

## Example

If your container has a binding for `EntryScript`:
```ts
import { launch } from 'haywire-launcher';
import { myHaywireContainer } from './container.js';

export default launch(myHaywireContainer);
```

If your container has a customer binding for a class that implements the `Main` interface:
```ts
import type { Main } from 'entry-script';
import { identifier } from 'haywire';
import { launch } from 'haywire-launcher';
import { myHaywireContainer } from './container.js';

// For simple demonstration purposes only!
// Do _not_ redefine your main id, and import the existing value.
const mainId = identifier<Main>();

export default launch(myHaywireContainer, mainId);
```

## Usage

`haywire-launcher` is an ESM module. That means it _must_ be `import`ed. To load from a CJS module, use dynamic import `const { launch } = await import('haywire-launcher');`.

## API

### launch(container, id = EntryScript)

Method that takes your main container, as well as an optional id (defaults to `EntryScript`) to be passed to the `.getAsync(<id>)` method of your container.

Synchronously returns an extension of `EntryScript` which proxy the `argv` parameters to your container's instance when invoked by the top level script.

_If_ not providing a custom id, the container must provide a binding for `EntryScript` that returns an _instance of_ a child class of `EntryScript`. This method is generally for convenience.

Otherwise you may customize your instances to not necessarily extend `EntryScript`, but simply implement the `Main` interface. The container must be capable of providing a non-`nullable()` and non-`undefinable()` instance.

Providing a container (and and optional id) that would not yield a proper `EntryScript` or `Main` interface will result in a type/build time error. Runtime will also experience issues because it will be incapable of fetching instances from the container.