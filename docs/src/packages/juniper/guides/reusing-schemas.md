---
description: Share schemas as $ref definitions with define, including recursive schemas.
---

# Reusing schemas

## `define`

`.define(name)` makes a schema a reusable definition. Wherever it is used, it is emitted as a `$ref`, and `toJSON()` adds every definition it references to `$defs`.

You reference the schema variable itself, so types flow exactly as they do without `define`, and a reference can never point at a missing definition.

```ts
import { arraySchema, objectSchema, stringSchema, type SchemaType } from 'juniper';

const address = objectSchema({
    properties: { city: stringSchema() },
    required: ['city'],
}).define('Address');

const user = objectSchema({
    properties: { home: address, work: address.nullable() },
}).define('User');

type User = SchemaType<typeof user>;
//   ^?

arraySchema(user).toJSON();
// {
//     type: 'array',
//     items: { $ref: '#/$defs/User' },
//     $defs: {
//         Address: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
//         User: {
//             type: 'object',
//             properties: {
//                 home: { $ref: '#/$defs/Address' },
//                 work: { anyOf: [{ $ref: '#/$defs/Address' }, { type: 'null' }] },
//             },
//         },
//     },
// }
```

### Derived schemas

A schema derived from a definition keeps the `$ref` when it only adds annotations (`description`, `title`, `examples`, ...) or is made `nullable()`.

Any other change, such as `omit()` or an extra constraint, makes it a different schema, so it is emitted inline. Define it under its own name to share it too:

```ts
import { numberSchema, objectSchema, stringSchema } from 'juniper';

const user = objectSchema({
    properties: { id: numberSchema(), name: stringSchema() },
    required: ['id', 'name'],
}).define('User');
// ---cut---
const newUser = user.omit(['id']).define('NewUser');
```

::: warning Names are unique
Two different schemas defined with the same name throw when serialized. The same schema can be
used any number of times.
:::

For schemas Juniper doesn't own, use [`.ref(path)`](/packages/juniper/reference/api#ref-path), where the path is up to you.

## Recursive schemas

`defineRecursive` defines a schema that references itself, such as a tree or a comment thread.

TypeScript can't infer a recursive type from a builder that uses itself, so declare the type, and the built schema is checked against it:

```ts
import { arraySchema, defineRecursive, numberSchema, objectSchema } from 'juniper';

interface TreeNode {
    value: number;
    children: TreeNode[];
    parent?: TreeNode | null;
}

const tree = defineRecursive<TreeNode>('TreeNode', self =>
    objectSchema({
        properties: {
            value: numberSchema(),
            children: arraySchema(self),
            parent: self.nullable(),
        },
        required: ['value', 'children'],
    })
);

tree.toJSON();
// {
//     $ref: '#/$defs/TreeNode',
//     $defs: {
//         TreeNode: {
//             type: 'object',
//             properties: {
//                 value: { type: 'number' },
//                 children: { type: 'array', items: { $ref: '#/$defs/TreeNode' } },
//                 parent: { anyOf: [{ $ref: '#/$defs/TreeNode' }, { type: 'null' }] },
//             },
//             required: ['value', 'children'],
//         },
//     },
// }
```

A schema that doesn't match the declared type is a compile error. Here `children` is missing from `required`:

```ts
// @errors: 2322
import { arraySchema, defineRecursive, numberSchema, objectSchema } from 'juniper';

interface TreeNode {
    value: number;
    children: TreeNode[];
}

const tree = defineRecursive<TreeNode>('TreeNode', self =>
    objectSchema({
        properties: {
            value: numberSchema(),
            children: arraySchema(self),
        },
        required: ['value'],
    })
);
```

`self`, and the returned schema, are references to the definition: they support `nullable()` and annotations such as `description()`, and are used like any other defined schema. Definitions can also reference each other by nesting `defineRecursive` calls.
