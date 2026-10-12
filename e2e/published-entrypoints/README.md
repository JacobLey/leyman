# e2e-published-entrypoints

Imports every entry point (each `exports` subpath) of every published package in the repo.

Workspace packages are installed here as copies of exactly the files they publish (see the `sync-injected` target), with only their `dependencies` and peers. So a test fails when a package's `files` leaves out a module it imports at runtime, or a runtime dependency is only in its `devDependencies`. A package's own tests can't catch either: they run from its source, with its dev dependencies installed.

Packages are found the way `Publish` finds what to release, so a new published package fails here until it is added to `devDependencies` (with its required peers).

It is not published, and has no source of its own: only tests.
