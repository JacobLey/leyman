# e2e-published-entrypoints

Imports every entry point (each `exports` subpath) of every published package from the files it publishes, with only its runtime dependencies.

Workspace packages are installed here as copies of exactly the files they publish (see the `sync-injected` target), with only their `dependencies` and peers. So a test fails when a package's `files` leaves out a module it imports at runtime, or a runtime dependency is only in its `devDependencies`. A package's own tests can't catch either: they run from its source, with its dev dependencies installed.

Packages are found the way `Publish` finds what to release, so a new published package fails here until it is added to `devDependencies` (with its required peers).

The `floor-test` target ([`scripts/floor-test.mjs`](scripts/floor-test.mjs)) imports them again on each package's floor, which is the exact oldest version its `engines.node` allows (`>=24` is 24.0.0, `>=22.12` is 22.12.0). It runs the spec once per floor, with that version's binary, naming that floor's packages in `FLOOR_TEST_PACKAGES`; without it, the spec imports every package whose floor's major the running Node.js meets.

The `floor-suites` target ([`scripts/floor-suites.mjs`](scripts/floor-suites.mjs)) goes further: it runs each package's own test suites (their `mocha-unit-test`, `mocha-integration-test` and `vitest-unit-test` commands, from their compiled `dist-test`) on its floor, without coverage, and fails naming every suite that failed. A project that overrides one of those commands is skipped for that target, with a message. It reruns every suite, so CI runs it nightly only (`test --floor-suites`). Integration suites need the devcontainer's Postgres and Valkey.

Both find each floor's binary at `$NODE_FLOORS/<version>/bin/node` ([`scripts/floors.mjs`](scripts/floors.mjs)), and fail naming every floor without one, so a new floor needs its image in `nodeFloorImages` in [`dagger/main.go`](../../dagger/main.go) rather than being skipped. Only the test runners use those binaries; Nx and pnpm stay on the newest. They run only in CI, where Dagger fills `NODE_FLOORS`, and are never cached, so a result from the newest Node.js can't stand in for them. Locally, fill a directory with each floor (the versions in `nodeFloorImages`) first:

```sh
export NODE_FLOORS=/tmp/node-floors
for version in 22.12.0 22.13.0 24.0.0 24.15.0 24.22.1; do
    mkdir -p "$NODE_FLOORS/$version/bin"
    ln -sf "$(pnpm --silent dlx "node@$version" -p process.execPath)" "$NODE_FLOORS/$version/bin/node"
done
nx run @leyman/e2e-published-entrypoints:floor-test
nx run @leyman/e2e-published-entrypoints:floor-suites
```

The `floor-types` target ([`scripts/floor-types.mjs`](scripts/floor-types.mjs)) checks the TypeScript floor, 6.0 (`typescript-floor`, pinned in the catalog). It type-checks each package's published declarations with both TypeScript 6.0 and the newest, as a strict consumer with `skipLibCheck: false` and its Node.js floor's `lib` and `target`, and runs its type tests (`tsc -p test`) with 6.0. The checks run in parallel, and it fails printing every error. It needs no extra binaries, so it runs locally as is: `nx run @leyman/e2e-published-entrypoints:floor-types`. CI runs it on every run, after `floor-test`. It is not cached, since its inputs span every published package's tests and their dependencies.

It also checks the barrels of the packages `barrelify` depends on, which can't use its target without a cycle.

It is not published, and has no source of its own, only tests.
