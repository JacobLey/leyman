---
name: docs-site
description: Writing docs site pages, and keeping them in sync when a documented package changes
---

# Docs Site

> Site: [`../../../docs/`](../../../docs/) · Setup and twoslash: [`docs/README.md`](../../../docs/README.md) · Deploy: [dagger-ci](../dagger-ci/SKILL.md#workflows)

The site is built with VitePress and deployed to GitHub Pages by CI on every push to `main`. Nothing to do per package beyond writing pages.

## Site layout

| Path | What |
|------|------|
| `/` | A router: the package categories and the demos, as cards. |
| `/packages/` | Every package, by category. Pages in `docs/src/packages/<package>/`. |
| `/demos/` | Every demo. Pages in `docs/src/demos/<demo>/`. |

[`docs/.vitepress/projects.ts`](../../../docs/.vitepress/projects.ts) lists every package (category, pitch, npm package paths, `related` packages, pages) and demo (pitch, source, `files` worth reading, packages it `uses`, `related` demos) once. The nav, a sidebar per package and demo, previous/next links (kept within one package), the home page, the `/packages/` and `/demos/` lists, the generated blocks below, and redirects from the old root-level package URLs are all built from it.

The build fails when the registry and the repo disagree: a pages directory with no entry, a slug naming nothing, a `sources`/`source`/`files` path that doesn't exist (so a rename can't silently break a GitHub link), or an overview page missing a generated block. Dagger leaves `.claude`, `.devcontainer`, `.github`, `.vscode` and `dagger` out of CI's source, so paths in those directories are only checked in a full checkout (`ciExcluded` in `config.ts`, kept in step with `New` in `dagger/main.go`): build locally before pushing.

Generated blocks, placed by hand on each overview page (`index.md`) so the markdown shows what renders:
- `<ProjectHeader />` right under the title. On a package: npm, source and changelog links. On a demo: its source, `files`, the packages it uses and related demos.
- `## Related` then `<ProjectRelated />` at the end of a package's overview: related packages (declared on either side) and the demos that use it. Required exactly when there is something to show.

## Documented packages

| Package | Pages |
|---------|-------|
| [`barrelify`](../../../apps/barrelify/) | [`docs/src/packages/barrelify/`](../../../docs/src/packages/barrelify/) |
| [`entry-script`](../../../tools/entry-script/) | [`docs/src/packages/entry-script/`](../../../docs/src/packages/entry-script/) |
| [`generated-signature`](../../../tools/generated-signature/generated-signature/) | [`docs/src/packages/generated-signature/`](../../../docs/src/packages/generated-signature/) |
| [`genever`](../../../apps/genever/) | [`docs/src/packages/genever/`](../../../docs/src/packages/genever/) |
| [`haywire`](../../../tools/haywire/) | [`docs/src/packages/haywire/`](../../../docs/src/packages/haywire/) |
| [`haywire-launcher`](../../../tools/haywire-launcher/) | [`docs/src/packages/haywire-launcher/`](../../../docs/src/packages/haywire-launcher/) |
| [`juniper`](../../../apps/juniper/) | [`docs/src/packages/juniper/`](../../../docs/src/packages/juniper/) |
| [`juniper-validator`](../../../apps/juniper-validator/) | [`docs/src/packages/juniper-validator/`](../../../docs/src/packages/juniper-validator/) |
| [`lease-cache`](../../../tools/lease-cache/) | [`docs/src/packages/lease-cache/`](../../../docs/src/packages/lease-cache/) |
| [`load-populate-files`](../../../apps/populate-files/load-populate-files/) | [`docs/src/packages/populate-files/`](../../../docs/src/packages/populate-files/) |
| [`mocha-chain`](../../../tools/test-chain/mocha-chain/) | [`docs/src/packages/mocha-chain/`](../../../docs/src/packages/mocha-chain/) |
| [`normalized-react-query`](../../../tools/normalized-react-query/) | [`docs/src/packages/normalized-react-query/`](../../../docs/src/packages/normalized-react-query/) |
| [`nx-lifecycle`](../../../apps/nx-lifecycle/) | [`docs/src/packages/nx-lifecycle/`](../../../docs/src/packages/nx-lifecycle/) |
| [`pg-dolly`](../../../tools/pg-dolly/) | [`docs/src/packages/pg-dolly/`](../../../docs/src/packages/pg-dolly/) |
| [`pg-dolly-schema`](../../../apps/pg-dolly-schema/) | [`docs/src/packages/pg-dolly-schema/`](../../../docs/src/packages/pg-dolly-schema/) |
| [`populate-files`](../../../apps/populate-files/populate-files/) | [`docs/src/packages/populate-files/`](../../../docs/src/packages/populate-files/) |
| [`unknown-error`](../../../tools/unknown-error/) | [`docs/src/packages/unknown-error/`](../../../docs/src/packages/unknown-error/) |
| [`vitest-chain`](../../../tools/test-chain/vitest-chain/) | [`docs/src/packages/vitest-chain/`](../../../docs/src/packages/vitest-chain/) |

Demos ([`demos/`](../../../demos/)) each have a directory in [`docs/src/demos/`](../../../docs/src/demos/), ported from the demo's README, with `<ProjectHeader />` under the title (it replaces a hand-written source link). A demo made of several runnable parts can be several demos that cross-reference through `related`, like the MCP server and the CLI:

| Demo | Page |
|------|------|
| [`read-through-cache`](../../../demos/read-through-cache/) | [`docs/src/demos/read-through-cache/index.md`](../../../docs/src/demos/read-through-cache/index.md) |
| [`openapi`](../../../demos/openapi/) | [`docs/src/demos/openapi/index.md`](../../../docs/src/demos/openapi/index.md) |
| [`agents/mcp`](../../../demos/agents/mcp/) | [`docs/src/demos/mcp-server/index.md`](../../../docs/src/demos/mcp-server/index.md) |
| [`agents/cli`](../../../demos/agents/cli/) | [`docs/src/demos/agent-cli/index.md`](../../../docs/src/demos/agent-cli/index.md) |
| [`oauth-server`](../../../demos/oauth-server/) | [`docs/src/demos/oauth-server/index.md`](../../../docs/src/demos/oauth-server/index.md) |

**When you document a new package or demo, add an entry to [`docs/.vitepress/projects.ts`](../../../docs/.vitepress/projects.ts) (see [Site layout](#site-layout)), a row here, and its paths to [`.claude/rules/docs-site-sync.md`](../../rules/docs-site-sync.md). When a demo starts using a documented package, add it to the demo's `uses`.**

## Keeping pages in sync

Every change to a documented package's API, behaviour, defaults, CLI flags or errors updates its pages **in the same commit**. A change that needs a [changeset](../versioning/SKILL.md) or a README update almost always needs a docs update too.

1. `grep -rn '<changed name>' docs/src/<package>/` to find every page that mentions what changed. Option tables, CLI tables and "Things to know" lists are easy to miss.
2. Update examples, tables and prose. Add the new feature where a reader would look for it (usually a guide and the reference page).
3. Build: `nx run @leyman/docs:build`.

The build catches some drift on its own: examples are type-checked against the package's built types, so a renamed export or changed signature fails it. It can't catch changed behaviour, defaults, CLI flags, output shown in comments, or JSON examples, so read the pages rather than relying on a green build.

The README and the docs site cover the same API, so keep them consistent. Fix a mistake found in one in the other.

## Writing pages

Each package has the same layout. Follow an existing package (haywire is the fullest):

| Page | Contents |
|------|----------|
| `index.md` | `<ProjectHeader />`, one-line pitch, a short example, **Get started →**, Features bullets, Compared to, `## Related` + `<ProjectRelated />` (when anything is related). |
| `getting-started.md` | Install (npm/pnpm/yarn `code-group`), the smallest working setup, Next steps. |
| `guides/*.md` | One topic each, for users who have the basics. |
| `reference/*.md` | Every option, flag and export, in tables. |
| `why.md` | Only when the package has a `WHY-<PACKAGE>.md`. |

- Every page has a `description` in frontmatter.
- Add each page to its package's `pages` in [`docs/.vitepress/projects.ts`](../../../docs/.vitepress/projects.ts), which builds the sidebar.
- Add a new package to `docs/package.json` `devDependencies` (`workspace:^`), so examples type-check against it and the site rebuilds when it changes.
- Link between pages with site paths (`/packages/haywire/guides/scopes`, `/demos/openapi/`), and to other documented packages' pages rather than npm. Dead links fail the build.
- Every `ts` block is type-checked. Use `// ---cut---` to hide setup, `// ^?` to show a type, and `// @errors: <code>` for an example that must fail. Use `// @noErrors` only for code that can't compile in isolation, like generated files that import their siblings.
- Use `json` or `sh` blocks for config and commands. They aren't checked, so where a config has a TypeScript type, also show it in a `ts` block with `satisfies` (see [nx-lifecycle's configuration](../../../docs/src/packages/nx-lifecycle/reference/configuration.md)).
