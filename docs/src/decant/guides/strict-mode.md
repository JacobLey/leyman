---
description: The mistakes decant rejects in strict mode, and how types follow validators without it.
---

# Strict mode

A schema can be valid JSON Schema and still be a mistake. Validators ignore these, so the schema silently accepts more, or less, than it appears to. Strict mode (the default) fails on them with a `DecantStrictModeError`, whose `pointer` names the schema at fault, rather than generating a type that hides the problem.

## Keywords that do nothing

- An unknown keyword, such as a misspelled `maxLenght`. Keywords starting with `x-` are allowed, as are OpenAPI's keywords in an OpenAPI document or with `openApi30`.
- A type specific keyword in a schema without a `type`, or whose `type` it doesn't apply to, such as `maxLength` on a number. Subschemas of `allOf`, `anyOf`, `oneOf`, `if`/`then`/`else` and `not` inherit their parent's type.
- A `required` property that isn't in `properties`, of the schema or a parent.
- `then` or `else` without `if`.

## Schemas that accept nothing, or less than they declare

- `minLength` greater than `maxLength`, and the same for `minItems`/`maxItems`, `minProperties`/`maxProperties` and `minContains`/`maxContains`.
- `minimum`/`exclusiveMinimum` and `maximum`/`exclusiveMaximum` that no number fits between, or no integer for `type: "integer"`.
- An `enum` or `const` value that isn't of the schema's `type`.
- A `required` property whose schema is never valid (such as `false`), or more required properties than `maxProperties` allows.
- `minProperties` more than an object with `additionalProperties: false` can have.
- A tuple (`prefixItems` with `items: false`) shorter than `minItems`, or longer than `maxItems`.

Every schema Juniper builds passes.

## Without strict mode

For schemas you don't control, disable strict mode with `--no-strict` (or `strict: false`). The type then follows what a validator accepts, and is never narrower:

- Unknown keywords, and keywords that don't apply to the type, are ignored, as validators ignore them.
- A schema without a `type` accepts every type. `{ "properties": { "a": … } }` is the object, or any string, number, boolean, `null` or array.
- A type whose constraints contradict each other is `never`. For `{ "type": ["string", "null"], "minLength": 3, "maxLength": 2 }`, only `null` is valid.
- Tuple items beyond `maxItems` are left out.

Some features are unsupported in either mode, as ignoring them would loosen the type: `$ref` to another file, `$dynamicRef` and `$recursiveRef` throw a `DecantUnsupportedError`.
