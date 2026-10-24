---
description: "The infrastructure this repository runs on, written up like the demos: what it is, how it is built, and why."
prev: false
next: false
---

# Infrastructure

What this repository itself runs on, in [`infra/`](https://github.com/JacobLey/leyman/tree/main/infra). Unlike the [demos](/demos/), these aren't examples: they are real, deployed systems that CI and every devcontainer depend on. They are written up the same way, as what they are and why, so they double as worked examples of deploying to the cloud.

The same bar as the rest of the repository applies:

- **Tested without the cloud**: against the same runtime and storage, run locally, so a change is proven before it is deployed.
- **Credentials by role**: CI holds only what it must, and a pull request, from a fork or not, holds none.
- **Written up as what it is, and why**: the trade-offs, the costs, and what it doesn't fix.

<InfrastructureCards />
