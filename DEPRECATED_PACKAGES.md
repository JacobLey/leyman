# Deprecated Packages

Packages that were published from this repo and have since been removed from it. They are still published, under the `jacobley` npm account, so they can be restored or republished later.

To restore one, check out its source from the "Last source" commit.

| Package | Last published | Removed | Last source | Reason |
|---|---|---|---|---|
| [`common-proxy`](https://www.npmjs.com/package/common-proxy) | 1.0.1 | 2026-10-21 | [`tools/common-proxy`](https://github.com/JacobLey/leyman/tree/2d19550adb17a31959f694cb34a137b6c44bf065/tools/common-proxy) | Node 22.12 and later can `require()` ESM directly, and every package in the repo requires Node 24, so wrapping an ESM import for CommonJS is no longer needed. |
| [`named-patch`](https://www.npmjs.com/package/named-patch) | 2.0.1 | 2026-10-12 | [`tools/named-patch`](https://github.com/JacobLey/leyman/tree/e895407fd4c111c8b456e393101195027a0d3e2d/tools/named-patch) | Unused. Wrapping production functions so tests can stub them adds test-only machinery to runtime code; dependency injection is used instead. |
| [`sinon-typed-stub`](https://www.npmjs.com/package/sinon-typed-stub) | 1.0.1 | 2026-10-12 | [`tools/sinon-typed-stub`](https://github.com/JacobLey/leyman/tree/cdb6e1892d373836a70792a540e03ccf3eb4ef26/tools/sinon-typed-stub) | Unused. Sinon already types stubs on existing objects, and tests no longer inject standalone stubs. |
| [`nx-plugin-handler`](https://www.npmjs.com/package/nx-plugin-handler) | 0.2.1 | 2026-10-04 | [`tools/nx-plugin-handler`](https://github.com/JacobLey/leyman/tree/c63b928a3451c11def31fd3a381669700585894d/tools/nx-plugin-handler) | Unused, and forwarding to a project-local plugin works against how Nx resolves plugins. |
| [`pnpm-dedicated-lockfile`](https://www.npmjs.com/package/pnpm-dedicated-lockfile) | 0.0.4 | 2026-09-28 | [`apps/pnpm-dedicated-lockfile`](https://github.com/JacobLey/leyman/tree/9221852969c8fc37389869b3922aabb28cebab03/apps/pnpm-dedicated-lockfile) | Replaced by Nx's own hashing of each project's npm dependencies. |
| [`nx-dagger`](https://www.npmjs.com/package/nx-dagger) | 0.1.0 | 2026-02-23 | [`apps/nx-dagger`](https://github.com/JacobLey/leyman/tree/01e47f4b808336e87eb7bf7b4595215bbe8b648e/apps/nx-dagger) | Generated Dagger CI functions from Nx targets. No longer used for CI. |
| [`nx-update-ts-references`](https://www.npmjs.com/package/nx-update-ts-references) | 0.2.1 | 2026-01-23 | [`apps/nx-update-ts-references`](https://github.com/JacobLey/leyman/tree/36596b0a1bac6228b4c5c1ce6a24d9440370e9d3/apps/nx-update-ts-references) | Replaced by `nx sync`. |
| [`nx-populate-files`](https://www.npmjs.com/package/nx-populate-files) | 0.1.0 | 2025-01-05 | [`apps/populate-files/nx-populate-files`](https://github.com/JacobLey/leyman/tree/acf058e7eb64580a8a782afd4fea81e0dee026fb/apps/populate-files/nx-populate-files) | Replaced by the `populate-files` CLI. |
| [`nx-tsc`](https://www.npmjs.com/package/nx-tsc) | 0.1.0 | 2025-01-05 | [`tools/nx-tsc`](https://github.com/JacobLey/leyman/tree/acf058e7eb64580a8a782afd4fea81e0dee026fb/tools/nx-tsc) | Replaced by running `tsc` directly. |
| [`rivendell`](https://www.npmjs.com/package/rivendell) | 0.3.3 | 2023-09-09 | [`apps/rivendell`](https://github.com/JacobLey/leyman/tree/763def2aac3ccc444248599c576397d9baa7724b/apps/rivendell) | Replaced by Nx. |
| [`dependency-order`](https://www.npmjs.com/package/dependency-order) | 1.1.6 | 2023-09-09 | [`tools/dependency-order`](https://github.com/JacobLey/leyman/tree/763def2aac3ccc444248599c576397d9baa7724b/tools/dependency-order) | Replaced by Nx. |
| [`packages-list`](https://www.npmjs.com/package/packages-list) | 1.1.6 | 2023-09-09 | [`tools/packages-list`](https://github.com/JacobLey/leyman/tree/763def2aac3ccc444248599c576397d9baa7724b/tools/packages-list) | Replaced by Nx. |
| [`root-package-json`](https://www.npmjs.com/package/root-package-json) | 1.1.6 | 2023-09-09 | [`tools/root-package-json`](https://github.com/JacobLey/leyman/tree/763def2aac3ccc444248599c576397d9baa7724b/tools/root-package-json) | Replaced by Nx. |
