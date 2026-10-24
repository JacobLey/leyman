---
description: Sign generated files so hand edits are detected, while keeping manual sections editable.
---

# generated-signature

Sign generated files so hand edits are detected, while keeping manual sections editable.

```ts
import { manualSection, sign, verify } from 'generated-signature';

const text = sign(
    `export const generated = 1;
${manualSection({ id: 'custom', body: 'export const custom = 1;', filePath: 'out.ts' })}
`,
    { filePath: 'out.ts' }
);

verify(text.replace('custom = 1', 'custom = 2')); // valid: inside the manual section
verify(text.replace('generated = 1', 'generated = 2')); // invalid
```

```ts
// @noErrors
// @generated-signature v1:… Generated file. Do not edit outside of manual sections.
export const generated = 1;
// @manual-start custom
export const custom = 1;
// @manual-end custom
```

**[Get started →](/packages/generated-signature/getting-started)**

## Features

- **Offline check**: `verify()` needs only the file, not the generator, so it is cheap enough for a lint rule or a pre-commit hook.
- **Manual sections**: mark regions a person may edit. Their content is left out of the signature, and `mergeSections()` carries it over when the file is regenerated.
- **Any text format**: markers own whole lines, so `verify()` doesn't need to know the comment syntax. Helpers write markers for [common file types](/packages/generated-signature/reference/api#commentstyle-filepath).
- **ESLint rule**: `generated-signature/eslint` reports hand-edited files in the editor. See [ESLint](/packages/generated-signature/guides/eslint).
- **Manifest**: files that can't hold a comment, like JSON, are hashed in a [manifest](/packages/generated-signature/reference/format#manifest) instead.
- **Zero dependencies**: only `node:crypto`. `eslint` is an optional peer, for the ESLint entry point only.

[populate-files](/packages/populate-files/) is the intended writer: with `signed: true` it does the signing and merging for you. This package works on plain strings, for generators that write their own files, and for tools that only check them.

A valid signature means nobody edited the file, not that it is up to date: regenerating it could still produce something else. Check freshness by regenerating, e.g. with populate-files' `check`.

## Compared to

| | Signature | Manual sections | Language |
|---|---|---|---|
| `generated-signature` | Yes | Yes | Any text format, JS API |
| Meta's SignedSource / `@partially-generated` | Yes | Yes | Internal tooling, not a general library |
| [cog](https://nedbatchelder.com/code/cog/) `--checksum` | Yes | Inverse: generated regions in a handwritten file | Python |
| Go's `// Code generated ... DO NOT EDIT.` | No, a convention only | No | Go |
