# e2e-published-entrypoints

Imports every entry point (each `exports` subpath) of every published package from the files it publishes, with only its runtime dependencies.

Workspace packages are installed here as copies of exactly the files they publish (see the `sync-injected` target), with only their `dependencies` and peers. So a test fails when a package's `files` leaves out a module it imports at runtime, or a runtime dependency is only in its `devDependencies`. A package's own tests can't catch either: they run from its source, with its dev dependencies installed.

Packages are found the way `Publish` finds what to release, so a new published package fails here until it is added to `devDependencies` (with its required peers).

The `floor-test` target imports them again on Node.js 22, the oldest a package may support, skipping packages whose `engines.node` needs newer. It runs only in CI (Dagger provides the binary at `NODE_22`), and is never cached, so a result from the newest Node.js can't stand in for it. Locally: `NODE_22=$(pnpm --silent dlx node@22 -p process.execPath) nx run @leyman/e2e-published-entrypoints:floor-test`.

The `floor-suites` target ([`scripts/floor-suites.mjs`](scripts/floor-suites.mjs)) goes further: it runs each of those packages' own test suites (their `mocha-unit-test`, `mocha-integration-test` and `vitest-unit-test` commands, from their compiled `dist-test`) on Node.js 22, without coverage, and fails naming every package that failed. Only the test runners use Node.js 22; Nx and pnpm stay on the newest. It reruns every suite, so CI runs it nightly only (`test --floor-suites`). Locally, with `NODE_22` set as above: `nx run @leyman/e2e-published-entrypoints:floor-suites`. Integration suites need the devcontainer's Postgres and Valkey.

It also checks the barrels of the packages `barrelify` depends on, which can't use its target without a cycle.

It is not published, and has no source of its own: only tests.
