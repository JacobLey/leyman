<div style="text-align:center">

# static-emitter
Statically typed event emitter.

[![npm package](https://badge.fury.io/js/static-emitter.svg)](https://www.npmjs.com/package/static-emitter)
[![License](https://img.shields.io/npm/l/static-emitter.svg)](https://github.com/JacobLey/leyman/blob/main/tools/static-emitter/LICENSE)

</div>

## Contents
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [events](#events)
  - [TypedEvent](#typedevent)
  - [CustomEvent](#customevent)
  - [StaticEventTarget](#staticeventtarget)
  - [StaticEmitter](#staticemitter)

## Install

```sh
npm i static-emitter
```

## Example

```ts
import { type events, StaticEmitter } from 'static-emitter';

// Declare events by extending StaticEmitter
class MyEmitter extends StaticEmitter {
    declare public [events]: {
        foo: [boolean, number[]];
        bar: [string];
    };
}

const myEmitter = new MyEmitter();
myEmitter.on('foo', (bool, nums) => {
    console.log(bool); // typed as boolean
    console.log(nums); // typed as number[]
});
myEmitter.emit('foo', true, [123]); // OK

myEmitter.emit('bar', { wrong: null }); // TypeScript error!
```

## Usage

`static-emitter` is an ESM module. It must be `import`ed. To load from a CJS module, use dynamic import: `const { StaticEmitter } = await import('static-emitter')`.

Individual exports are also available at sub-paths:

| Import path | Exports |
|-------------|---------|
| `static-emitter` | all exports |
| `static-emitter/static-event-target` | `StaticEventTarget` |
| `static-emitter/typed-event` | `TypedEvent` |
| `static-emitter/custom-event` | `CustomEvent` |

Events are declared as a key-value map of `eventName → eventDetail`. The detail type drives all listener and emit signatures. When the detail is an `Event` subclass (e.g. `MouseEvent`) it is used directly; any other type is wrapped in a `CustomEvent`.

## API

### `events`

A type-only `symbol` used to declare the event map on a class that extends `StaticEventTarget` or `StaticEmitter`. It has no runtime value and must always be used with `declare` or `typeof`.

```ts
import { type events, StaticEmitter } from 'static-emitter';

class MyEmitter extends StaticEmitter {
    declare public [events]: {
        ready: [void];
        data: [Buffer];
    };
}
```

---

### `TypedEvent`

A type-only cast of the browser [`Event`](https://developer.mozilla.org/en-US/docs/Web/API/Event) with a generic parameter for the event name. Useful when constructing events for use with `StaticEventTarget`.

```ts
import { TypedEvent } from 'static-emitter'; // or 'static-emitter/typed-event'

const ev: TypedEvent<'ready'> = new TypedEvent('ready');
```

---

### `CustomEvent`

On browsers: a type-only cast of [`CustomEvent`](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent) that extends `TypedEvent` and adds a generic `detail` parameter. When `detail` is non-null the `detail` option is required in the constructor.

On Node.js: a polyfill for `CustomEvent`.

```ts
import { CustomEvent } from 'static-emitter'; // or 'static-emitter/custom-event'

const ev = new CustomEvent('data', { detail: Buffer.from('hello') });
```

---

### `StaticEventTarget`

A type-only extension of the browser [`EventTarget`](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget). Declares which events may be dispatched and listened to, enforcing types on the native `addEventListener`, `removeEventListener`, and `dispatchEvent` methods. There is no extra runtime code — the value is purely in TypeScript's type system.

Events can be declared via a generic type parameter (when instantiating or extending directly) or via the `[events]` property on a subclass.

```ts
import { CustomEvent, events, StaticEventTarget } from 'static-emitter';

// Via generic parameter
const target = new StaticEventTarget<{
    click: MouseEvent;
    status: 'ok' | 'error';
}>();

target.addEventListener('click', (e: MouseEvent) => { /* ... */ });
target.addEventListener('status', (e: CustomEvent<'status', 'ok' | 'error'>) => { /* ... */ });
target.dispatchEvent(new CustomEvent('status', { detail: 'ok' }));

// Via subclass
class MyTarget extends StaticEventTarget<{ click: MouseEvent }> {
    declare [events]: this[typeof events] & { status: 'ok' | 'error' };
}
```

#### `.addEventListener(type, listener, options?)`

Typed override of `EventTarget.addEventListener`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `type` | `string` (declared event name) | — | Required. Event name. |
| `listener` | typed listener or `EventListenerObject` | — | Required. Callback or handler object. |
| `options` | `boolean \| AddEventListenerOptions` | — | Optional. Native listener options. |

#### `.removeEventListener(type, listener, options?)`

Typed override of `EventTarget.removeEventListener`. Parameters mirror `addEventListener`.

#### `.dispatchEvent(event)`

Typed override of `EventTarget.dispatchEvent`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `event` | typed `Event` for the declared event name | — | Required. The event to dispatch. |

**Returns** `boolean` — `true` if no listener called `preventDefault()`.

---

### `StaticEmitter`

Extends `StaticEventTarget` with Node.js `EventEmitter`-style methods (`on`, `once`, `off`, `emit`), support for `symbol` event names, and non-`Event` detail values. All native `EventTarget` methods remain available and fully typed.

`symbol` events and non-`Event` details require the helper methods (`on`/`once`/`off`/`emit`). Non-`CustomEvent` events (e.g. native `MouseEvent`) must use the native `addEventListener`/`dispatchEvent` methods; type constraints still apply.

Listener callbacks receive `(detail, nativeCustomEvent)` — the unwrapped detail as the first argument.

```ts
import { StaticEmitter } from 'static-emitter';

const connect = Symbol('connect');

const emitter = new StaticEmitter<{
    data: string;
    [connect]: { port: number };
}>();

emitter.on('data', (value: string) => console.log(value));
emitter.once(connect, ({ port }) => console.log(port));

emitter.emit('data', 'hello');
emitter.emit(connect, { port: 3000 });

emitter.off('data', handler);
```

#### `new StaticEmitter<InterfaceEvents>()`

Constructor takes no arguments. Events are declared via the `InterfaceEvents` generic or the `[events]` symbol property on subclasses.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `InterfaceEvents` | `Record<string \| symbol, unknown>` | `{}` | Optional generic. Map of event name to detail type. |

#### `.on(eventName, listener)`

Registers a listener. Returns `this` for chaining. Aliased as `.addListener()`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `eventName` | declared event name (`string` or `symbol`) | — | Required. |
| `listener` | `(detail, event) => void` | — | Required. Receives the unwrapped detail. |

#### `.once(eventName, listener)`

Registers a one-time listener that is removed after its first invocation. Returns `this`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `eventName` | declared event name (`string` or `symbol`) | — | Required. |
| `listener` | `(detail, event) => void` | — | Required. |

#### `.off(eventName, listener)`

Removes a previously registered listener. Accepts both helper-style and native-style listeners. Returns `this`. Aliased as `.removeListener()`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `eventName` | any declared event name | — | Required. |
| `listener` | the listener reference originally passed to `on`/`once`/`addEventListener` | — | Required. |

#### `.emit(eventName, detail)`

Dispatches an event. Returns `this`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `eventName` | declared event name (`string` or `symbol`) | — | Required. |
| `detail` | the declared detail type for this event | — | Required. |
