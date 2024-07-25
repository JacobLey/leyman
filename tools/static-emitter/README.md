<div style="text-align:center">

# static-emitter
Statically typed event emitter.

[![npm package](https://badge.fury.io/js/static-emitter.svg)](https://www.npmjs.com/package/static-emitter)
[![License](https://img.shields.io/npm/l/static-emitter.svg)](https://github.com/JacobLey/leyman/blob/main/tools/static-emitter/LICENSE)

</div>

## Contents
- [Introduction](#introduction)
- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
  - [TypedEvents](#typedevent)
  - [CustomEvent](#customevent)
  - [events](#events)
  - [StaticEventTarget](#staticeventtarget)
  - [StaticEmitter](#staticemitter)

## Introduction

EventTarget with support for static type enforcement of events.

The default event target allows for any `string` as the event name, and the data as `Event`. So knowing/using type information is impossible without extra (unnecessary) validations, or manual casting (risky).

StaticEmitter is a wrapper of `EventTarget` that enforces event format via static type declarations. It also supports non-`Event` bodies, `symbol` events, and NodeJS-esque syntax (`on()`, `emit()`...).

A type-only wrapper of `EventTarget` is also available, `StaticEventTarget`.

StaticEmitter works in both NodeJS and the browser.

## Install

```sh
npm i static-emitter
```

## Example

```ts
import { type events, StaticEmitter } from 'static-emitter';

class MyEmitter extends StaticEmitter {
    declare public [events]: {
        foo: [boolean, number[]];
        bar: [string];
    }
}

const myEmitter = new StaticEmitter<{
    foo: number[];
    bar: string;
}>();
myEmitter.on('foo', nums => {
    console.log(nums); // typed as number[]
});
myEmitter.emit('foo', [123]); // success!

myEmitter.emit('bar', { wrong: null }); // Typescript error!
```

## Usage

static-emitter is an ESM module. That means it _must_ be `import`ed. To load from a CJS module, use dynamic import `const { StaticEmitter, StaticEventTarget } = await import('static-emitter');`.

The `StaticEventTarget` is a type-cast of [EventTarget](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget). It provides _no_ extra functionality in javascript-land. Therefore, it is highly recommended this class be used in Typescript to gain any benefit from static typing. It may be loaded separately via `import { StaticEventTarget } from 'static-emitter/static-event-target';`.

The `StaticEmitter` is an extension of `StaticEventTarget`. It includes support for symbol events, non-event bodies, and EventEmitter-esque syntax.

## API

### TypedEvent

Type-only casting of [`Event`](https://developer.mozilla.org/en-US/docs/Web/API/Event). Includes a generic parameter for setting the eventName.

This casting may be convenient for usage with raw `StaticEventTarget`.

```ts
import { TypedEvent } from 'static-emitter';
// Or solo
import { TypedEvent } from 'static-emitter/typed-event';

const myEvent: TypedEvent<'abc'> = new TypedEvent('abc');
```

### CustomEvent

_On Browser_ type-only casting of [`CustomEvent`](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent). Extends `TypedEvent` and includes an additional generic parameter for setting the `detail`. For non-null details, the `detail` option will be required.

_On NodeJS_ a polyfill for `CustomEvent`, which does not natively exists.

```ts
import { CustomEvent } from 'static-emitter';
// Or solo
import { CustomEvent } from 'static-emitter/custom-event';

const myEvent: CustomEvent<'abc', 123> = new TypedEvent('abc', { detail: 123 });
const myNullEvent: CustomEvent<'foo', null> = new TypedEvent('foo');
```

### events

A type-only symbol for declaring events on emitter extension. Not strictly required if event declarations only occur via generic parameters.

Note that `events` _does not exist_ in javascript, and should only be used for event declarations.

Ensure any usage is paired with the `typeof` or `declare` keywords.

### StaticEventTarget

A type-only extension of [EventTarget](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget). Events can be declared which enforce the allowed dispatch/listener events.

Events can be declared via generic parameters (recommended when instantiating/extending an EventTarget directly) or via the `events` property.

Events are declared as a key-value mapping of `eventName` and `eventDetail`.

When `eventDetail` is an Event-extension (e.g. `MouseEvent`) then the detail is left unchanged. When any other type, it is wrapped in a `CustomEvent`.

```ts
import { CustomEvent, events, StaticEventTarget } from 'static-emitter';
// Or solo
import { StaticEventTarget } from 'static-emitter/static-event-target';

class MyTarget extends StaticEventTarget<{
    click: MouseEvent;
}> {}

class MyExtendedTarget extends MyTarget {
    [events]: MyTarget[events] & {
        foo: 'bar';
    }
}
const myTarget = new MyExtendedTarget();

// Alternative
const myTarget = new StaticEventTarget<{
    click: MouseEvent;
    foo: 'bar';
}>();

myTarget.addEventListener('click', (mouseEvent: MouseEvent) => {...});
myTarget.addEventListener('foo', {
    handleEvent: (mouseEvent: CustomEvent<'foo', 'bar'>) => {...}),
});
// Typescript Error! Type mismatch.
myTarget.addEventListener('foo', (numEvent: CustomEvent<'foo', number>) => {...});

myTarget.dispatchEvent(new CustomEvent('foo', { detail: 'bar' }));
myTarget.dispatchEvent(new MouseEvent('click'));
```

### StaticEmitter

Extension of `StaticEventTarget` with support for symbol events, non-event bodies, and EventEmitter-esque syntax.

The event declaration syntax of `StaticEmitter` is the same as `StaticEventTarget`, and any native events can be used the same way.

Note that `symbol` events and non-event bodies cannot use the native EventTarget methods.
Similarly, any non-`CustomEvent` events cannot use the helper methods and must rely on EventTarget's native methods (type constraints will still be applied). The exception is `off()` which supports all event names/listeners.

Listener methods (`on` + `addListener`) will pass two parameters. The first is the parsed `detail` from the custom event, and the raw CustomEvent as the second parameter.

```ts
import { CustomEvent, StaticEmitter } from 'static-emitter';

const serverConnect = Symbol('server-connect');

const myTarget = new StaticEmitter<{
    click: MouseEvent;
    foo: 'bar';
    [serverConnect]: { port: number; timestamp: Date };
}>();

myTarget.on('foo', (bar: 'bar', nativeEvent: CustomEvent<'foo', 'bar'>) => {});
// Alias for `on()`
myTarget.addListener(serverConnect, (connectionDetails: { port: number; timestamp: Date }) => {});
// Typescript Error! Type mismatch.
myTarget.on('foo', (num: number) => {});
// Typescript Error! Native MouseEvent not supported.
myTarget.on('click', (mouseEvent: MouseEvent) => {});

// Remove listener immediately after first event
myTarget.once('foo', (bar: 'bar') => {});

myTarget.emit('foo', 'bar');
myTarget.emit(serverConnect, { port: 3000, timestamp: new Date() });
// Typescript Error! Type mismatch.
myTarget.emit('foo', 123);

// Example only, note this wouldn't actually "remove" anything, as this function was never added.
myTarget.off(serverConnect, () => {})
// Alias for `off()`. Supports native format.
myTarget.removeListener('foo', {
    handleEvent: (customEvent: CustomEvent<'foo', 'bar'>) => {},
});
// Supports native events
myTarget.off('click', (mouseEvent: MouseEvent) => {});
```
