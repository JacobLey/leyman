---
name: docs-site
description: Writing docs site pages, and keeping them in sync when a documented package changes
---

# Docs Site

> Site: [`../../../docs/`](../../../docs/) · Setup and twoslash: [`docs/README.md`](../../../docs/README.md) · Deploy: [dagger-ci](../dagger-ci/SKILL.md#workflows)

The site is built with VitePress and deployed to GitHub Pages by CI on every push to `main`. Nothing to do per package beyond writing pages.

## Documented packages

| Package | Pages |
|---------|-------|
| [`barrelify`](../../../apps/barrelify/) | [`docs/src/barrelify/`](../../../docs/src/barrelify/) |
| [`genever`](../../../apps/genever/) | [`docs/src/genever/`](../../../docs/src/genever/) |
| [`haywire`](../../../tools/haywire/) | [`docs/src/haywire/`](../../../docs/src/haywire/) |
| [`juniper`](../../../apps/juniper/) | [`docs/src/juniper/`](../../../docs/src/juniper/) |
| [`juniper-validator`](../../../apps/juniper-validator/) | [`docs/src/juniper-validator/`](../../../docs/src/juniper-validator/) |
| [`nx-lifecycle`](../../../apps/nx-lifecycle/) | [`docs/src/nx-lifecycle/`](../../../docs/src/nx-lifecycle/) |
| [`unknown-error`](../../../tools/unknown-error/) | [`docs/src/unknown-error/`](../../../docs/src/unknown-error/) |

**When you document a new package, add a row here and to the `paths` of [`.claude/rules/docs-site-sync.md`](../../rules/docs-site-sync.md).**

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
| `index.md` | One-line pitch, a short example, **Get started →**, Features bullets, Compared to. |
| `getting-started.md` | Install (npm/pnpm/yarn `code-group`), the smallest working setup, Next steps. |
| `guides/*.md` | One topic each, for users who have the basics. |
| `reference/*.md` | Every option, flag and export, in tables. |
| `why.md` | Only when the package has a `WHY-<PACKAGE>.md`. |

- Every page has a `description` in frontmatter.
- Add each page to the sidebar in [`docs/.vitepress/config.ts`](../../../docs/.vitepress/config.ts), and a new package to the home page features in [`docs/src/index.md`](../../../docs/src/index.md).
- Add a new package to `docs/package.json` `devDependencies` (`workspace:^`), so examples type-check against it and the site rebuilds when it changes.
- Link between pages with site paths (`/haywire/guides/scopes`), and to other documented packages' pages rather than npm. Dead links fail the build.
- Every `ts` block is type-checked. Use `// ---cut---` to hide setup, `// ^?` to show a type, and `// @errors: <code>` for an example that must fail. Use `// @noErrors` only for code that can't compile in isolation, like generated files that import their siblings.
- Use `json` or `sh` blocks for config and commands. They aren't checked, so where a config has a TypeScript type, also show it in a `ts` block with `satisfies` (see [nx-lifecycle's configuration](../../../docs/src/nx-lifecycle/reference/configuration.md)).
