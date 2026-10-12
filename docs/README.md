# @leyman/docs

Documentation site for the packages in this repo, built with [VitePress](https://vitepress.dev/) and deployed to GitHub Pages from `main`. Not published to npm.

Proof of concept: only [`juniper`](../apps/juniper) is documented so far.

## Type-checked examples

Every `ts` code block is compiled with [twoslash](https://twoslash.netlify.app/) against the built types of the packages it imports, which are installed like any other dependency. A type error fails the build, unless the block expects it:

````md
```ts
// @errors: 2339
import { arraySchema } from 'juniper';

arraySchema().maxLength(10);
```
````

- `// ^?` under an identifier renders its inferred type.
- Lines above `// ---cut---` are compiled but not shown, for setup the reader doesn't need.
- Compiler options are in [`tsconfig.twoslash.json`](./tsconfig.twoslash.json).

Twoslash only checks types. Output shown in comments, like `// { type: 'string' }`, is not checked.

Links between pages are checked too: a dead link fails the build.

## Developing

```bash
nx run @leyman/docs:vitepress-dev   # dev server at http://localhost:5173/leyman/, type errors shown inline
nx run @leyman/docs:build           # build into dist/, failing on any type error or dead link
```

A package's docs live in `src/<package>/`, with a sidebar entry in [`.vitepress/config.ts`](./.vitepress/config.ts). Pages are Markdown, with VitePress's [containers and code groups](https://vitepress.dev/guide/markdown). Document a package's types by adding it to `devDependencies` (`workspace:^`).

VitePress 2 is in alpha, so its version is pinned exactly in the catalog. Bump it deliberately and check the build.
