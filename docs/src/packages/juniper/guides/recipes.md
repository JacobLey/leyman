---
description: Short solutions to common problems.
---

# Recipes

## TypeScript enums

TypeScript enums are objects that sometimes have [reverse mappings](https://www.typescriptlang.org/docs/handbook/enums.html#reverse-mappings), so `Object.values` doesn't reliably list their values. [enum-to-array](https://www.npmjs.com/package/enum-to-array) does:

```ts
import { enumToValues } from 'enum-to-array';
import { enumSchema, type SchemaType } from 'juniper';

enum Status {
    ACTIVE = 'active',
    BANNED = 404,
}

const status = enumSchema({ enum: enumToValues(Status) });
type StatusType = SchemaType<typeof status>;
//   ^?

status.toJSON();
// { enum: ['active', 404] }
```

## Validating `$ref` paths you manage yourself

`.ref(path)` emits a `$ref` to a location Juniper doesn't control. When the target is also built with Juniper, prefer [`define`](/packages/juniper/guides/reusing-schemas), which places the definition for you and can't dangle.

## Vendor extensions

Attach OpenAPI `x-` extensions, or any other custom keyword, with `.metadata()`:

```ts
import { stringSchema } from 'juniper';

stringSchema().metadata('x-internal', true).toJSON();
// { type: 'string', 'x-internal': true }
```

Keys that are already JSON Schema keywords are rejected:

```ts
// @errors: 2345
import { numberSchema } from 'juniper';

numberSchema().metadata('maximum', 5);
```
