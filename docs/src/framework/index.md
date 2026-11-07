---
description: "This repository's setup (Nx task lifecycle, shared configs, checks, devcontainer and agent skills) as a framework another repository adopts in slices, rather than by copying the repository."
---

# Framework

The packages on this site are built on a setup of their own: an Nx monorepo with one task lifecycle (prepare, check, build, test, verify), shared configs, strict checks on what gets published, a devcontainer per git worktree, and skills that let a coding agent work in it from the first session.

This section is about that setup, so another repository can adopt it. The goal is a framework rather than a template: install versioned packages, upgrade when you choose, copy only what can't be a package, and take as much or as little as fits.

The setup is built to be worked on mostly by coding agents. Most of its documentation is in skills (`.agents/skills/` in the repository), listed in [`AGENTS.md`](https://github.com/JacobLey/leyman/blob/main/AGENTS.md). A page here is the source of a skill's text where people need it too, and the skill points to it, so an agent and a person read the same thing.

Start with the [principles](/framework/principles): they are the reasons behind every other choice. Then pick how much to take from the [adoption tiers](/framework/adoption): published checks, shared configs, the Nx plugin and lifecycle, or the whole devcontainer and CI. To try it, [get started](/framework/getting-started) from an empty directory.
