---
"static-emitter": major
---

Redesign as thin, typed subclasses of the native `EventTarget`/`Event`/`CustomEvent`.

- Events are declared only via the class generic. The `events` symbol and `[events]` property declarations are removed.
- `on()`/`once()` return an unsubscribe function and accept `{ signal }`. `off()`, `addListener()` and `removeListener()` are removed.
- Every `on()`/`once()` call registers a new listener, even when the same function is already registered.
- New `next(type, { signal })` resolves with the detail of the next occurrence of an event.
- `emit()` returns `void`, and its detail may be omitted when the detail type accepts `undefined`.
- Symbol event names are no longer supported.
- `CustomEvent` is renamed to `TypedCustomEvent` (sub-path `static-emitter/typed-custom-event`), and an `undefined` detail is no longer coerced to `null`.
- `StaticEventTarget`, `TypedEvent` and `TypedCustomEvent` are now real subclasses, rather than type-only casts of the native classes.
- Helper types (`EventMap`, `EventOf`, `DetailListener`, etc.) are exported.
