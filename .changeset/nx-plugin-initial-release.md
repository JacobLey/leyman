---
"@leyman/nx-plugin": minor
---

First public release: an Nx plugin inferring the build, test, lint and package-check targets of TypeScript ESM packages from their files, a `targets` executor writing the same targets into `nx.json` and each `project.json`, an `init` generator (run by `nx add @leyman/nx-plugin`) setting a workspace up for it, and a `package` generator adding a package with its targets declared.
