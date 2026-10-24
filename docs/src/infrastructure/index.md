---
description: "The infrastructure this repository runs on: what it is, how it is built, and why."
prev: false
next: false
---

# Infrastructure

What this repository itself runs on, in [`infra/`](https://github.com/JacobLey/leyman/tree/main/infra). Unlike the [demos](/demos/), these aren't examples: they are real, deployed systems that CI and every devcontainer depend on. Each page explains what the system is and why it is built that way, so they also work as examples of deploying to the cloud.

They follow the same rules as the rest of the repository:

- **Tested without the cloud**: against the same runtime and storage, run locally, so a change is proven before it is deployed.
- **Credentials by role**: CI holds only what it must, and a pull request, from a fork or not, holds none.
- **Documented**: the trade-offs, the costs, and what it doesn't fix.

<InfrastructureCards />
