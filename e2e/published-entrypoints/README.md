# e2e-published-entrypoints

Imports every entry point (each `exports` subpath) of every published package from the files it publishes, with only its runtime dependencies.

Workspace packages are installed here as copies of exactly the files they publish (see the `sync-injected` target), with only their `dependencies` and peers. So a test fails when a package's `files` leaves out a module it imports at runtime, or a runtime dependency is only in its `devDependencies`. A package's own tests can't catch either: they run from its source, with its dev dependencies installed.

Packages are found the way `Publish` finds what to release, so a new published package fails here until it is added to `devDependencies` (with its required peers).

The `floor-test` target imports them again on Node.js 22, the oldest a package may support, skipping packages whose `engines.node` needs newer. It runs only in CI (Dagger provides the binary at `NODE_22`), and is never cached, so a result from the newest Node.js can't stand in for it. Locally: `NODE_22=$(pnpm --silent dlx node@22 -p process.execPath) nx run @leyman/e2e-published-entrypoints:floor-test`.

It also checks the barrels of the packages `barrelify` depends on, which can't use its target without a cycle.

It is not published, and has no source of its own: only tests.
