<div style="text-align:center">

# Why pnpm-dedicated-lockfile?

</div>

## The Problem

[pnpm](https://pnpm.io/) stores a single `pnpm-lock.yaml` at the monorepo root covering all packages. This is necessary for pnpm to manage shared dependencies and caching efficiently.

The downside is Nx cache invalidation.

When Nx runs a target, it needs a list of files that, when changed, would mean the result could be different and it busts cache. The naive
solution is to add `pnpm-lock.yaml`. However that file is not unique to the project, and _any changes_ to _any project_ across the codebase would
result in a cache bust, and lots of unnecessary work.

## The Solution

`pnpm-dedicated-lockfile` computes the subset of `pnpm-lock.yaml` that applies to a single package — its direct and transitive dependencies only. This per-package lockfile is stable: it only changes when _that package's_ dependency tree changes.

Add that to the your Nx inputsand only the jobs whose packages were actually affected will invalidate their cache.

This file could also be versioned and used in CI workflows.

---

**Note:** The generated file is _not_ a real lockfile and cannot replace `pnpm-lock.yaml`. It is intended only for CI caching busting.

---

