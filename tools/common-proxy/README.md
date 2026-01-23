<div style="text-align:center">

# common-proxy
Conveniently expose ESM-backed methods as a syncronously available (commonjs) async method.

[![npm package](https://badge.fury.io/js/common-proxy.svg)](https://www.npmjs.com/package/common-proxy)
[![License](https://img.shields.io/npm/l/common-proxy.svg)](https://github.com/JacobLey/leyman/blob/main/tools/common-proxy/LICENSE)

</div>

## Contents

- [Introduction](#introduction)
- [Usage](#usage)
- [API](#api)
  - [commonProxy](#commonproxy)

## Introduction

ESM methods import asyncronously. If your codebase is all ESM, then that is easy to work with!

But sometimes you _have_ to support CommonJS, either because you are developing a plugin or existing codebase hasn't been migrated to ESM yet.

`common-proxy` is a CommonJs package that can be provided with your ESM import and syncronously expose the main default export as a promise-returning method.

## Usage

### How it used to work:

```mts
// my-module.mts
export const sayHello = (name: string): void => `hello ${name}`;

export default function add(x: number, y: number): number {
    return x + y;
};
```

```cts
// my-old-script.cts
// Error! Cannot `require` an ESM package
import add from './my-module';

(async () => {
    // Works... but requires, and isn't accessible elsewhere
    const { sayHello } = await import('./my-module');
    sayHello('Jacob');
})();
```

### How it works with common-proxy

```cts
// my-module.cts
import { commonProxy } from 'common-proxy';

const imported = import('./my-module.mjs');

export default commonProxy(imported);
export const sayHello = imported.then(mod => mod.sayHello);
```

```cts
// my-new-script.cts
import add, { sayHello } from './my-module.cjs';

// Both return promises!
const sum: Promise<number> = add(1, 2);
sayHello('Jacob');
```

## API

### commonProxy

Takes a Promise of a function, and _syncronously_ returns a function that has the same signature and returns a promise that eventually resolves with the real result from the true function.

_If_ the parameter is actually a module with a `default` property (the way `import(<package>)` exposes a default export), the method from default import will be used. See [default-import](https://www.npmjs.com/package/default-import) for more context.

Any other methods should be passed directly. This can be achieved with promise chaining `import(<package>).then(mod => mod.methodName)`.