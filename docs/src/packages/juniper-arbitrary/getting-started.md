---
description: Install juniper-arbitrary, make an arbitrary from a schema, and use it in a property test.
---

# Getting started

## Install

`fast-check` and `juniper` are peer dependencies, so install all three:

::: code-group

```sh [npm]
npm i --save-dev juniper-arbitrary fast-check juniper
```

```sh [pnpm]
pnpm add --save-dev juniper-arbitrary fast-check juniper
```

```sh [yarn]
yarn add --dev juniper-arbitrary fast-check juniper
```

:::

::: tip
juniper-arbitrary is ESM only, and requires Node.js 22.13 or later.
:::

## Make an arbitrary

Pass a schema to `makeArbitrary`, and use the result anywhere fast-check takes an arbitrary:

```ts
import * as fc from 'fast-check';
import { arraySchema, stringSchema } from 'juniper';
import { makeArbitrary } from 'juniper-arbitrary';

const tags = arraySchema(stringSchema().minLength(1)).uniqueItems(true);

fc.assert(
    fc.property(makeArbitrary(tags), value => {
        // Sorting keeps every tag
        return value.toSorted().length === value.length;
    })
);
```

Failures shrink to smaller values that are still valid, and replay from fast-check's seed.

## Check a validator

A schema's arbitrary is a quick way to test anything else that reads the schema, such as a [validator](/packages/juniper-validator/) or a rendered form of the schema:

```ts
import * as fc from 'fast-check';
import { numberSchema } from 'juniper';
import { makeArbitrary } from 'juniper-arbitrary';
import { makeValidator } from 'juniper-validator';

const score = numberSchema().minimum(0).maximum(100);
const validator = makeValidator(score);

fc.assert(fc.property(makeArbitrary(score), value => validator.is(value)));
```

## Next steps

- [How values are generated](/packages/juniper-arbitrary/guides/how-values-are-generated): what is aimed at, what is filtered, and what is deliberately limited.
- [API](/packages/juniper-arbitrary/reference/api): `makeArbitrary` and its errors.
