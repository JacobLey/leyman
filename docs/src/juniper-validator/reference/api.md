---
description: makeValidator, JuniperValidator and the utility types of juniper-validator.
---

# API

## `makeValidator(schema, options?)`

Compiles a schema into a validator. Compiling is the slow part, so make each validator once and reuse it.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `schema` | `Schema<T> \| JsonSchema<T>` | — | A Juniper schema, or a rendered JSON Schema object. Juniper schemas are rendered with `$schema`. |
| `options` | `Omit<AjvOptions, 'jsPropertySyntax' \| 'strict'>` | `{}` | [Ajv options](https://ajv.js.org/options.html). |

**Returns** `JuniperValidator<T>`, typed by the schema.

Validation uses Ajv's JSON Schema 2020-12 validator ([`Ajv2020`](https://ajv.js.org/json-schema.html#draft-2020-12)), which matches Juniper's output.

- **Always strict.** [Strict mode](https://ajv.js.org/strict-mode.html) is always on, and `strict` can't be passed. Juniper's output always passes it: keywords added with [`.metadata()`](/juniper/reference/api#metadata-key-value-metadata-record) are registered as annotations. A rendered JSON Schema with an unknown keyword is rejected; register it with Ajv's `keywords` option. The exception is Ajv's `strictTuples` check, off by default because it rejects open tuples (`arraySchema().prefixItem(...)`); pass `strictTuples: true` to turn it on.
- **`discriminator` is on.** Ajv's `discriminator` option defaults to `true`, for Juniper's [discriminated unions](/juniper/guides/openapi#discriminated-unions). Pass `discriminator: false` to turn it off.
- **JSON Pointer paths.** `jsPropertySyntax` can't be passed, so each issue's `instancePath` is a [JSON Pointer](https://datatracker.ietf.org/doc/html/rfc6901), which its [`path`](/juniper-validator/guides/standard-schema#issues) is read from.
- **Options that change the value.** `coerceTypes`, `useDefaults` and `removeAdditional` change the value passed in, and `validate()` returns that same value.
- **Standard formats.** `email`, `uuid`, `date-time` and the other formats of [ajv-formats](https://www.npmjs.com/package/ajv-formats) are validated. Add your own with Ajv's `formats` option:

```ts
import { stringSchema } from 'juniper';
import { makeValidator } from 'juniper-validator';

const skuValidator = makeValidator(stringSchema().format('sku'), {
    formats: { sku: /^[A-Z]{3}-\d{4}$/u },
});
```

## `JuniperValidator<T>`

Returned by `makeValidator`, and implements [`StandardSchemaV1<T>`](/juniper-validator/guides/standard-schema) and [`StandardJSONSchemaV1<T>`](/juniper-validator/guides/standard-schema#json-schema).

| Member | Type | Description |
|--------|------|-------------|
| `is` | `(value: unknown) => value is T` | Returns whether the value matches, narrowing it to `T`. |
| `assert` | `(value: unknown) => asserts value is T` | Throws when the value doesn't match, and narrows it to `T` after the call. |
| `validate` | `(value: unknown) => StandardSchemaV1.Result<T>` | Returns `{ value }` when the value matches, or `{ issues }` when it doesn't. |
| `~standard` | `StandardJSONSchemaV1.Props<T> & StandardSchemaV1.Props<T>` | The [Standard Schema](/juniper-validator/guides/standard-schema#the-standard-property) and [Standard JSON Schema](/juniper-validator/guides/standard-schema#json-schema) interfaces. |

`assert` throws an `Error` with the message `Value does not match schema`, and Ajv's [error objects](https://ajv.js.org/api.html#error-objects) as its `cause`. To narrow with it, its type must be written out. See [`assert()`](/juniper-validator/getting-started#assert-throw).

## Utility types

| Type | Example | Description |
|------|---------|-------------|
| `ValidatorType` | `ValidatorType<typeof validator>` | The type a validator checks for. The same as `SchemaType` of its schema. |
| `AssertionType` | `AssertionType<typeof validator>` | The type of a validator's `assert`, to annotate it with. |

```ts
import { numberSchema } from 'juniper';
import { makeValidator, type AssertionType, type ValidatorType } from 'juniper-validator';

const validator = makeValidator(numberSchema().minimum(0));

type Amount = ValidatorType<typeof validator>;
//   ^?

const assertAmount: AssertionType<typeof validator> = validator.assert;
```
