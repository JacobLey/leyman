---
description: Report hand-edited generated files in the editor with the generated-signature ESLint plugin.
---

# ESLint

A generator only notices an edit to its output the next time it runs. The `generated-signature/eslint` plugin reports it as soon as the file is linted, in the editor and in your lint step.

```js
// eslint.config.js
import generatedSignature from 'generated-signature/eslint';

export default [generatedSignature.configs.recommended];
```

`configs.recommended` registers the plugin (as `generated-signature`) and turns on every rule as an error. To pick rules yourself, register it and configure them:

```js
// eslint.config.js
import generatedSignature from 'generated-signature/eslint';

export default [
    {
        plugins: { 'generated-signature': generatedSignature },
        rules: { 'generated-signature/valid': 'warn' },
    },
];
```

The plugin is a separate entry point, so importing `generated-signature` never loads it. `eslint` is an optional peer dependency, needed only when you use the plugin.

## `generated-signature/valid`

Reports a signed file whose signature doesn't match, because it was edited outside its manual sections, or whose token or manual section markers are malformed. Unsigned files are ignored.

```ts
// @noErrors
// @generated-signature v1:… Generated file. Do not edit outside of manual sections.
export const generated = 2; // ❌ edited by hand
// @manual-start custom
export const custom = 2; // ✅ manual sections may be edited
// @manual-end custom
```

| Message | When |
|---------|------|
| Generated file was edited outside of its manual sections. Regenerate it instead. | The signature doesn't match. Reported on the token. |
| Generated file is malformed: `<reason>`. | The token or markers can't be read. Reported on the line at fault, with a [`MalformedReason`](/packages/generated-signature/reference/api#errors). |

There is no autofix: re-signing would just approve the edit. Regenerate the file instead, or move the change into a manual section.

## Files ESLint doesn't lint

ESLint only lints the files it is configured for, usually JavaScript and TypeScript. To check every signed file whatever its type, e.g. YAML or shell scripts in a pre-commit hook, call [`verify()`](/packages/generated-signature/reference/api#verify-text) on each one.
