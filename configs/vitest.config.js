/**
 * Shared vitest config, used by the `vitest-unit-test` target.
 *
 * Plain object (rather than `defineConfig`) so it can be loaded without resolving `vitest` from this directory.
 */
export default {
    test: {
        include: ['dist/tests/unit/**/*.spec.js'],
        // Forked workers are killed before V8 can flush coverage, so c8 would see nothing.
        // Worker threads write their coverage on exit.
        pool: 'threads',
        sequence: {
            // vitest-chain passes context forward through hooks, so hooks must run in registration order.
            // The default (`stack`) runs afterEach/afterAll in reverse.
            hooks: 'list',
        },
        experimental: {
            // Tests are pre-compiled, so load them with native `import`.
            // Keeps V8 coverage attributed to the real files on disk, for c8 to collect.
            viteModuleRunner: false,
        },
    },
};
