---
description: "The infrastructure this repository runs on: what it is, how it is built, and why."
prev: false
next: false
---

# Infrastructure

These pages cover what the repository itself runs on, kept in [`infra/`](https://github.com/JacobLey/leyman/tree/main/infra). Unlike the [demos](/demos/), they are real, deployed systems that CI and every devcontainer depend on. Each page explains what the system is and why it is built the way it is, so the pages also work as examples of deploying to the cloud.

They follow the same rules as the rest of the repository:

- Each system is tested without the cloud, against the same runtime and storage run locally, so a change is proven before it is deployed.
- CI holds only the credentials it needs, and a pull request (from a fork or not) holds none.
- The trade-offs, the costs and what the system doesn't fix are written down.

<InfrastructureCards />
