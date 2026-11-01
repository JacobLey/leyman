---
description: Which schema keywords juniper-arbitrary aims at, which it filters, and which shapes it deliberately limits.
---

# How values are generated

Generators aim at each keyword, then a validator checks the result. How a keyword is handled decides how fast generation is, never whether a value is valid.

| Keywords | Handling |
|---|---|
| `type`, `enum`, `const`, numeric bounds, `multipleOf`, `minLength`, `maxLength`, `minItems`, `maxItems`, `uniqueItems`, `items`, `prefixItems`, `contains`, `minContains`, `properties`, `required`, `additionalProperties`, `patternProperties`, `propertyNames`, `minProperties`, `dependentRequired`, `dependentSchemas` | Generated directly. |
| `pattern` | Generated from the regular expression. Several combine when they can (`startsWith()`, `contains()`, `endsWith()`). Lookaround is removed first, since fast-check can't generate from it. |
| `format` | Generated for every format Juniper knows by name. Any other is a plain string. |
| `allOf`, `anyOf`, `$ref`, recursion | Resolved, then generated directly. `anyOf` reaches every branch. |
| `oneOf`, `if`/`then`/`else` | Each branch is generated, and values matching too many are dropped. |
| `not`, `unevaluatedItems`, `unevaluatedProperties`, `maxContains`, `maxProperties` | Values that don't match are dropped. |

## Deliberate limits

- **Objects get a few undeclared properties** unless `additionalProperties` says otherwise, since a real payload can have them.
- **Recursion stops a few levels deep**, as each level multiplies the size of a value.
- **Numbers mix doubles with integers**, since doubles alone are nearly all huge or tiny.
- **A schema with a great many conditionals** only reaches its first 64 combinations.

## When generation gives up

A value is rejected up to 1000 times in a row before generation throws [`UnsatisfiableSchemaError`](/packages/juniper-arbitrary/reference/api#errors). That only happens for a schema random values rarely satisfy, such as a backreference in a `pattern`. Use a simpler schema, or a hand-written arbitrary with `.chain()`, for that part.
