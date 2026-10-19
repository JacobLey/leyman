---
description: Emit OpenAPI 3.0 and 3.1 schemas, fill components.schemas from your definitions, and declare discriminated unions.
---

# OpenAPI

OpenAPI 3.1 uses JSON Schema 2020-12, which is Juniper's default output. OpenAPI 3.0 uses an older dialect, which `toJSON({ openApi30: true })` emits from the same schema:

```ts
import { stringSchema } from 'juniper';

const schema = stringSchema().nullable();

schema.toJSON();
// { type: ['string', 'null'] }

schema.toJSON({ openApi30: true });
// { type: 'string', nullable: true }
```

Keywords that 3.0 lacks are converted where possible. For example, `if`/`then`/`else` and `dependentRequired` become `anyOf` branches. Keywords with no 3.0 equivalent, like `contains`, are dropped, so the 3.0 schema may accept more than the 2020-12 one. The [schema reference](/juniper/reference/schemas) lists which keywords each version supports.

## Components

OpenAPI keeps shared schemas in `components.schemas`. `components()` collects every [definition](/juniper/guides/reusing-schemas) reachable from the given schemas, ready to place there.

With `openApi30: true`, references already point at `#/components/schemas/`. For OpenAPI 3.1, pass `definitionsPath`.

::: code-group

```ts [OpenAPI 3.1]
import { arraySchema, numberSchema, objectSchema, stringSchema } from 'juniper';

const user = objectSchema({
    properties: { id: numberSchema(), name: stringSchema() },
    required: ['id', 'name'],
}).define('User');
const newUser = user.omit(['id']).define('NewUser');
const post = objectSchema({
    properties: { author: user, body: stringSchema() },
    required: ['author', 'body'],
}).define('Post');
// ---cut---
import { components } from 'juniper';

const options = { definitionsPath: '#/components/schemas/' };

const spec = {
    openapi: '3.1.0',
    info: { title: 'Blog', version: '1.0.0' },
    components: { schemas: components([user, newUser, post], options) },
    paths: {
        '/users/{userId}': {
            get: {
                responses: {
                    200: {
                        description: 'User',
                        content: { 'application/json': { schema: user.toJSON(options) } },
                    },
                },
            },
        },
    },
};
```

```ts [OpenAPI 3.0]
import { arraySchema, numberSchema, objectSchema, stringSchema } from 'juniper';

const user = objectSchema({
    properties: { id: numberSchema(), name: stringSchema() },
    required: ['id', 'name'],
}).define('User');
const newUser = user.omit(['id']).define('NewUser');
const post = objectSchema({
    properties: { author: user, body: stringSchema() },
    required: ['author', 'body'],
}).define('Post');
// ---cut---
import { components } from 'juniper';

const options = { openApi30: true };

const spec = {
    openapi: '3.0.3',
    info: { title: 'Blog', version: '1.0.0' },
    components: { schemas: components([user, newUser, post], options) },
    paths: {
        '/users/{userId}': {
            get: {
                responses: {
                    200: {
                        description: 'User',
                        content: { 'application/json': { schema: user.toJSON(options) } },
                    },
                },
            },
        },
    },
};
```

:::

Pass the same options to `components()` and to every `toJSON()` in the spec, so every reference points at the same place.

Output is deterministic: definitions are sorted by name, not by where they are used, so a committed spec only changes when a schema does.

## Discriminated unions

Pass `discriminator` to an object schema's `oneOf`, to name the property that tells the branches apart:

```ts
import { booleanSchema, enumSchema, numberSchema, objectSchema, type SchemaType } from 'juniper';

const cat = objectSchema({
    properties: { kind: enumSchema({ enum: ['cat'] as const }), lives: numberSchema() },
    required: ['kind'],
});
const dog = objectSchema({
    properties: { kind: enumSchema({ enum: ['dog'] as const }), goodBoy: booleanSchema() },
    required: ['kind'],
});

const pet = objectSchema().oneOf([cat, dog], { discriminator: 'kind' });
type Pet = SchemaType<typeof pet>;
//   ^?

pet.toJSON();
// { type: 'object', oneOf: [...], discriminator: { propertyName: 'kind' } }
```

Every branch must require the property, as a string enum of one value that no other branch uses. Anything else is a compile error that says which rule is broken:

```ts
import { enumSchema, objectSchema } from 'juniper';

const cat = objectSchema({
    properties: { kind: enumSchema({ enum: ['cat'] as const }) },
    required: ['kind'],
});
// ---cut---
// @errors: 2345
objectSchema().oneOf([cat, cat], { discriminator: 'kind' });
```

Branches can be [definitions](/juniper/guides/reusing-schemas), which most OpenAPI code generators expect, so each branch becomes its own named type.

The `discriminator` keyword is emitted in every output, for OpenAPI 3.0 and 3.1 alike. Strict Ajv rejects it as unknown unless you pass Ajv's `discriminator: true` option, which also makes Ajv check only the branch the property selects. [Juniper Validator](/juniper-validator/) turns it on for you.

To type the spec's schemas in another project, without depending on the code that built it, generate them with [genever](/genever/guides/openapi), which gives the same types Juniper inferred.

A complete users and posts API, built with [openapi3-ts](https://www.npmjs.com/package/openapi3-ts) and checked to be valid OpenAPI 3.0 and 3.1, is in [e2e/juniper-openapi](https://github.com/JacobLey/leyman/blob/main/e2e/juniper-openapi/test/data/api.ts).
