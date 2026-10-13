---
description: Inject values that only exist at runtime, like an HTTP request, with a container factory.
---

# Runtime values

A container expects every value to be buildable from its bindings. Some values only exist later, like the HTTP request being handled, or the user who sent it.

Building, checking and wiring a new container for every request is wasteful. Instead, create a **container factory** from a module with those dependencies still unbound. Check and wire it once, then bind the missing values for each request and create a container:

```ts
import { bind, createContainer, createContainerFactory, createModule, identifier } from 'haywire';

interface IncomingRequest {
    url: string;
}
interface User {
    id: string;
}
const requestId = identifier<IncomingRequest>();
const userId = identifier<User>();

class RequestHandler {
    constructor(
        private readonly request: IncomingRequest,
        private readonly user: User
    ) {}

    handle() {
        return `${this.user.id} requested ${this.request.url}`;
    }
}

const factory = createContainerFactory(
    createModule(
        bind(RequestHandler).withDependencies([requestId, userId]).withConstructorProvider()
    )
);

// Once, at startup or in a test
factory.check();
factory.wire();

const handleRequest = (request: IncomingRequest, user: User) => {
    const container = createContainer(
        factory.bindInstance(requestId, request).bindInstance(userId, user)
    );
    return container.get(RequestHandler).handle();
};
```

Each container shares the factory's checking and wiring, so it is cheap to create, but has its own [singletons](/haywire/guides/scopes). `createContainer(factory)` and `factory.toContainer()` are equivalent.

See [Web frameworks](/haywire/guides/frameworks) for this pattern in Hono, Fastify and Next.js.

Container factories are immutable: `bindInstance()` returns a new factory, so one factory can serve many requests at once.

## Checks

Binding instances is checked like adding bindings to a module. Creating a container before every dependency is bound is a compile error:

```ts
// @errors: 2769
import { bind, createContainer, createContainerFactory, createModule, identifier } from 'haywire';

interface IncomingRequest {
    url: string;
}
interface User {
    id: string;
}
const requestId = identifier<IncomingRequest>();
const userId = identifier<User>();
class RequestHandler {
    constructor(
        private readonly request: IncomingRequest,
        private readonly user: User
    ) {}
}
const factory = createContainerFactory(
    createModule(
        bind(RequestHandler).withDependencies([requestId, userId]).withConstructorProvider()
    )
);
declare const request: IncomingRequest;
// ---cut---
createContainer(factory.bindInstance(requestId, request));
```

So is binding an id twice, or binding a value laxer than its dependents need, such as `null` where they need a value:

```ts
// @errors: 2345
import { bind, createContainer, createContainerFactory, createModule, identifier } from 'haywire';

interface IncomingRequest {
    url: string;
}
interface User {
    id: string;
}
const requestId = identifier<IncomingRequest>();
const userId = identifier<User>();
class RequestHandler {
    constructor(
        private readonly request: IncomingRequest,
        private readonly user: User
    ) {}
}
const factory = createContainerFactory(
    createModule(
        bind(RequestHandler).withDependencies([requestId, userId]).withConstructorProvider()
    )
);
declare const request: IncomingRequest;
// ---cut---
factory.bindInstance(userId.nullable(), null);
```

A factory can bind ids that nothing depends on yet, but only instances: bindings with providers and dependencies belong in the module.

`factory.check()` assumes the values bound later are synchronous singletons with no dependencies.
