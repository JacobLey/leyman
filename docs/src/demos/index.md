---
description: Worked examples of using open-source projects and services well, each a fully tested package run against real services.
prev: false
next: false
---

# Demos

Worked examples of putting open-source projects and services together well. Each demo is a small package in [`demos/`](https://github.com/JacobLey/leyman/tree/main/demos), never published. You read its code rather than install it.

Each one is held to the same bar as the published packages, so the code can be copied with confidence:

- **Tested against real services**, never mocks: the same Valkey (or Postgres) image runs as a devcontainer sidecar and as a service in CI.
- **100% coverage**, type-checked and linted.
- **Features tested on their own**: where a demo has several moving parts, each is an option, composed from [haywire](/packages/haywire/) bindings, so its effect (and cost) shows separately.
- **Documented**: what each library does and doesn't do, the gaps found, and what was learned building it.

<DemoCards />
