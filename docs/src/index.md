---
layout: home
description: TypeScript libraries and tools for Node.js ESM environments, and worked examples of putting open-source projects together well.
hero:
  name: Leyman
  tagline: TypeScript libraries and tools for Node.js ESM environments, and worked examples of putting open-source projects together well.
  actions:
    - theme: brand
      text: Packages
      link: /packages/
    - theme: alt
      text: Demos
      link: /demos/
    - theme: alt
      text: Infrastructure
      link: /infrastructure/
    - theme: alt
      text: Framework
      link: /framework/
---

Leyman is a monorepo of TypeScript packages for Node.js. It also holds the shared configs and tooling they are built with, demos tested against real services, and the infrastructure that CI and every devcontainer run on.

## Packages

Each package is published to npm on its own, and has a getting-started page, guides and a full reference here. [All packages →](/packages/)

<CategoryCards />

## Demos

Worked examples of open-source projects and services used together. Each one is a small package that isn't published, fully tested against real services, with a page on what it does and why. [All demos →](/demos/)

<DemoCards />

## Infrastructure

The real, deployed systems this repository runs on, and how they are built. [All infrastructure →](/infrastructure/)

<InfrastructureCards />

## Framework

The setup these packages are built on, written up as a framework that another repository can adopt a piece at a time. [Start here →](/framework/)

## For AI agents

[`llms.txt`](/llms.txt) lists every package, demo and piece of infrastructure, with links to its pages, npm and source. A package's README and types also ship with it on npm.
