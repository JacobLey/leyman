<div style="text-align:center">

# static-emitter
Statically typed event emitter.

[![npm package](https://badge.fury.io/js/static-emitter.svg)](https://www.npmjs.com/package/static-emitter)
[![License](https://img.shields.io/npm/l/static-emitter.svg)](https://github.com/JacobLey/leyman/blob/main/tools/static-emitter/LICENSE)

</div>

- **Native** — a thin subclass of `EventTarget`, so it runs in Node.js, browsers, Deno and Bun with no dependencies, and works anywhere an `EventTarget` is accepted.
- **Typed** — declare an event map once; event names, details, listeners and dispatched events are all checked.
- **Detail helpers** — `on`/`once`/`next`/`emit` deal in plain detail values instead of `CustomEvent` boilerplate.
- **Abortable** — every subscription returns an unsubscribe function and accepts an `AbortSignal`.

## Contents
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [StaticEmitter](#staticemitter)
  - [StaticEventTarget](#staticeventtarget)
  - [TypedCustomEvent](#typedcustomevent)
  - [TypedEvent](#typedevent)
  - [Types](#types)

## Install

```sh
npm i static-emitter
```

## Example

```ts
import { StaticEmitter } from 'static-emitter';

const emitter = new StaticEmitter<{
    data: string;
    ready: undefined;
}>();

const unsubscribe = emitter.on('data', value => {
    console.log(value); // typed as string
});
emitter.emit('data', 'hello'); // OK
emitter.emit('data', 123); // TypeScript error!
emitter.emit('ready'); // detail is optional when it accepts `undefined`

unsubscribe();

const value = await emitter.next('data'); // Promise<string>
```

## Usage

`static-emitter` is an ESM module. It must be `import`ed. To load from a CJS module, use dynamic import: `const { StaticEmitter } = await import('static-emitter')`.

Individual exports are also available at sub-paths:

| Import path | Exports |
|-------------|---------|
| `static-emitter` | all exports |
| `static-emitter/static-emitter` | `StaticEmitter` |
| `static-emitter/static-event-target` | `StaticEventTarget` |
| `static-emitter/typed-custom-event` | `TypedCustomEvent` |
| `static-emitter/typed-event` | `TypedEvent` |

Events are declared as a map of `eventName → value`, passed as a generic:
- When the value is an `Event` subclass (e.g. `MouseEvent`), that event is dispatched as-is.
- Any other value is a _detail_, dispatched inside a `TypedCustomEvent`.

Event names must be strings, as required by `EventTarget`.

Subclasses that should allow further events can forward a generic:

```ts
class BaseEmitter<Events extends EventMap = NoEvents> extends StaticEmitter<
    Events & { base: string }
> {}

class ChildEmitter extends BaseEmitter<{ child: number }> {}
```

### Native semantics

Both classes are real `EventTarget`s, so native behavior applies:
- A listener that throws does not stop other listeners, and the error is not thrown by `emit()`/`dispatchEvent()`. It is reported instead (`uncaughtException` in Node.js, `window.onerror` in browsers).
- `addEventListener` ignores a listener already registered for the same event. `on`/`once` wrap each listener, so every call registers it again.

## API

### `StaticEmitter`

Extends `StaticEventTarget` with helpers for _detail_ events. Events whose value is an `Event` subclass are excluded from these helpers, and must use the native methods.

#### `new StaticEmitter<Events>()`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `Events` | `EventMap` | `NoEvents` | Optional generic. Map of event name to `Event` subclass or detail type. |

#### `.on(type, listener, options?)`

Listens to an event's detail.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `type` | detail event name | — | Required. |
| `listener` | `(detail, event) => void` | — | Required. Receives the detail and its `TypedCustomEvent`. |
| `options.signal` | `AbortSignal` | — | Optional. Removes the listener when aborted. |
| `options.once` | `boolean` | `false` | Optional. Removes the listener after its first call. |

**Returns** `() => void` — removes the listener.

#### `.once(type, listener, options?)`

Same as `.on()`, but the listener is removed after its first call.

#### `.next(type, options?)`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `type` | detail event name | — | Required. |
| `options.signal` | `AbortSignal` | — | Optional. Rejects with the signal's `reason` when aborted. |

**Returns** `Promise<Detail>` — the detail of the next occurrence of the event.

#### `.emit(type, detail)`

Dispatches a `TypedCustomEvent` with the detail. `detail` may be omitted when its type accepts `undefined`.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `type` | detail event name | — | Required. |
| `detail` | declared detail type | — | Required unless it accepts `undefined`. |

---

### `StaticEventTarget`

`EventTarget` whose `addEventListener`, `removeEventListener` and `dispatchEvent` only accept declared events.

```ts
import { StaticEventTarget, TypedCustomEvent } from 'static-emitter';

const target = new StaticEventTarget<{
    click: MouseEvent;
    status: 'ok' | 'error';
}>();

target.addEventListener('click', event => {}); // event: MouseEvent
target.addEventListener('status', event => {}); // event: TypedCustomEvent<'status', 'ok' | 'error'>
target.dispatchEvent(new TypedCustomEvent('status', { detail: 'ok' }));
```

#### `.addEventListener(type, listener, options?)`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `type` | declared event name | — | Required. |
| `listener` | typed callback, `handleEvent` object, or `null` | — | Required. |
| `options` | `boolean \| AddEventListenerOptions` | — | Optional. Native listener options. |

#### `.removeEventListener(type, listener, options?)`

Parameters mirror `addEventListener`.

#### `.dispatchEvent(event)`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `event` | any declared event | — | Required. |

**Returns** `boolean` — `false` if a listener called `preventDefault()` on a cancelable event.

---

### `TypedCustomEvent`

`CustomEvent` with a literal `type` and a typed `detail`. `detail` may only be omitted when its type accepts `null`. Unlike native `CustomEvent`, an `undefined` detail stays `undefined` rather than becoming `null`.

```ts
import { TypedCustomEvent } from 'static-emitter';

const event = new TypedCustomEvent('data', { detail: 'hello' });
// TypedCustomEvent<'data', string>
```

---

### `TypedEvent`

`Event` with a literal `type`. Useful as a base class for declared `Event` subclasses.

```ts
import { TypedEvent } from 'static-emitter';

class ServerEvent<T extends string> extends TypedEvent<T> {
    public constructor(type: T, public readonly serverData: string) {
        super(type);
    }
}
```

---

### Types

| Type | Description |
|------|-------------|
| `EventMap` | Constraint for event maps: `Record<string, unknown>`. |
| `NoEvents` | Default event map, with no events. |
| `EventName<Events>` | All declared event names. |
| `DetailEventName<Events>` | Event names usable with the `StaticEmitter` helpers. |
| `EventOf<Events, K>` | Event object dispatched for event `K`. |
| `AnyEventOf<Events>` | Union of every declared event object. |
| `TypedEventListener<Events, K>` | Native listener (function or `handleEvent` object) for event `K`. |
| `DetailListener<Events, K>` | `StaticEmitter` listener for event `K`. |
| `SubscribeOptions` | `{ signal?: AbortSignal }`. |
