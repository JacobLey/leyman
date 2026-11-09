---
description: Worked examples of using open-source projects and services well, each a fully tested package run against real services.
prev: false
next: false
---

# Demos

These demos are worked examples of putting open-source projects and services together well. Each one is a small package in [`demos/`](https://github.com/JacobLey/leyman/tree/main/demos) that isn't published, so you read its code rather than install it.

The demos are held to the same bar as the published packages, so their code can be copied with confidence.

- They're tested against real services rather than mocks. The same Valkey (or Postgres) image runs as a devcontainer sidecar and as a service in CI.
- They have 100% test coverage, and are type-checked and linted.
- Where a demo has several moving parts, each part is an option, composed from [haywire](/packages/haywire/) bindings, so its effect (and its cost) can be seen on its own.
- Each demo documents what each library does and doesn't do, the gaps that turned up, and what was learned while building it.

<DemoCards />
