---
title: "How narrow are generated TypeScript types? Six JSON Schema generators compared"
description: "genever, json-schema-to-typescript, quicktype, json-schema-to-zod, json-schema-to-ts and TypeBox, given the same schema every night, with each generated type checked against valid values, invalid values and reads."
date: 2026-11-07
packages: [genever, juniper]
---

# How narrow are generated TypeScript types? Six JSON Schema generators compared

<PostHeader />

A JSON Schema can say more than most generated TypeScript types do. A tuple of two numbers becomes `number[]`, an ID that must start with `ord_` becomes `string`, and an object that only allows `x-` headers takes any key. The type compiles, and bad data goes straight through it.

<!-- Author to fill: one concrete sentence on what prompted genever (the moment a too-wide generated type let bad data through). -->

I wrote [genever](/packages/genever/) so those would be compile errors. To check that it really is narrower than the alternatives, and stays that way, a nightly job gives it and five other generators the same schema and type-checks what each one produces.

## The same schema, two outputs

A schema for an order, with one property per feature that TypeScript can express but most generators don't:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "id": { "type": "string", "pattern": "^ord_" },
    "location": {
      "type": "array",
      "prefixItems": [{ "type": "number" }, { "type": "number" }],
      "items": false,
      "minItems": 2
    },
    "shipping": {
      "oneOf": [
        {
          "type": "object",
          "properties": { "kind": { "const": "pickup" }, "store": { "type": "string" } },
          "required": ["kind", "store"],
          "additionalProperties": false
        },
        {
          "type": "object",
          "properties": { "kind": { "const": "delivery" }, "address": { "type": "string" } },
          "required": ["kind", "address"],
          "additionalProperties": false
        }
      ]
    },
    "headers": {
      "type": "object",
      "patternProperties": { "^x-": { "type": "string" } },
      "additionalProperties": false
    },
    "payment": {
      "type": "object",
      "properties": { "card": { "type": "string" }, "billingAddress": { "type": "string" } },
      "dependentRequired": { "card": ["billingAddress"] },
      "additionalProperties": false
    }
  },
  "required": ["id"],
  "additionalProperties": false
}
```

[json-schema-to-typescript](https://www.npmjs.com/package/json-schema-to-typescript) 16.0.0, the most-downloaded tool that writes a `.ts` file from JSON Schema, generates this (banner comment removed):

```ts
export interface Order {
  id: string;
  /**
   * @minItems 2
   */
  location?: never[];
  shipping?:
    | {
        kind: "pickup";
        store: string;
      }
    | {
        kind: "delivery";
        address: string;
      };
  headers?: {
    /**
     * This interface was referenced by `undefined`'s JSON-Schema definition
     * via the `patternProperty` "^x-".
     */
    [k: string]: string;
  };
  payment?: {
    card?: string;
    billingAddress?: string;
  };
}
```

The `oneOf` union is right. `location` is `never[]`, so even a valid `[1, 2]` fails to compile (2020-12's `prefixItems` isn't read). `id` and `headers` take any string, and `payment` allows a card without a billing address.

`npx genever order.json --name Order` writes:

```ts
export type Order = {
    /**
     * @pattern "^ord_"
     */
    id: `ord_${string}`;
    /**
     * @minItems 2
     */
    location?: [number, number];
    shipping?:
        | {
              kind: 'pickup';
              store: string;
          }
        | {
              kind: 'delivery';
              address: string;
          };
    headers?: {
        [key: `x-${string}`]: string;
    };
    payment?: {
        card?: string;
        billingAddress?: string;
    } & (
        | {
              card?: never;
          }
        | {
              billingAddress: string;
          }
    );
};
```

Each of those mistakes is now a compile error:

```ts
type Order = {
    id: `ord_${string}`;
    location?: [number, number];
    headers?: { [key: `x-${string}`]: string };
    payment?: { card?: string; billingAddress?: string } & (
        | { card?: never }
        | { billingAddress: string }
    );
};
// ---cut---
// @errors: 2322 2353
const wrongId: Order = { id: 'usr_1' };
const wrongLocation: Order = { id: 'ord_1', location: [1, 2, 3] };
const wrongHeader: Order = { id: 'ord_1', headers: { accept: 'json' } };
const noBillingAddress: Order = { id: 'ord_1', payment: { card: '4242' } };
```

## How the comparison works

One schema proves nothing, so the comparison runs every night in CI. Every tool gets [the same documents](https://github.com/JacobLey/leyman/blob/main/e2e/genever-comparison/src/documents.ts): one JSON Schema with a property per feature (nullable values, mixed enums, tuples, `oneOf` objects, recursion, closed `patternProperties`, literal patterns and `dependentRequired`), and an OpenAPI 3.1 document for the tools that read OpenAPI.

Each [probe](https://github.com/JacobLey/leyman/blob/main/e2e/genever-comparison/src/probes.ts) is one line of TypeScript, compiled against the generated type:

- **accepts**: a value the schema allows must type-check.
- **rejects**: a value the schema forbids must not type-check.
- **reads**: reading a value must give exactly the right type, compared with an identity check, so `any` doesn't pass.

Most comparisons only check that valid values are accepted, which any wide enough type does; `any` passes all of them. The rejecting probes are the ones that separate the tools.

I wrote the probes too, so of course genever passes them. Each one follows what the spec says a validator must accept or reject, and the documents and probes are public; if one is unfair to a tool, or a feature is missing, [open an issue](https://github.com/JacobLey/leyman/issues).

[json-schema-to-ts](https://www.npmjs.com/package/json-schema-to-ts) and [TypeBox](https://www.npmjs.com/package/typebox) infer types inside TypeScript instead of writing a file, so they get the schema pasted in `as const`. That is their best case. Import the same schema from a `.json` file and TypeScript widens it; json-schema-to-ts then gives `unknown`.

## What the latest run found

Results from the 2026-11-06 run, 23 JSON Schema probes each:

| Tool                      | Version | Passed | Missed                                                                                                                           |
| ------------------------- | ------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| genever                   | 0.10.1  | 23     |                                                                                                                                  |
| json-schema-to-typescript | 16.0.0  | 18     | tuples, closed `patternProperties`, literal patterns, `dependentRequired`                                                        |
| quicktype                 | 26.0.0  | 17     | tuple length, narrowing `oneOf` objects, closed `patternProperties`, literal patterns, `dependentRequired`                       |
| json-schema-to-ts         | 3.1.1   | 17     | tuples, recursion (a type error), closed `patternProperties`, literal patterns, `dependentRequired`                              |
| TypeBox                   | 1.4.3   | 17     | tuples, recursion, closed `patternProperties`, literal patterns, `dependentRequired`                                             |
| json-schema-to-zod        | 2.8.1   | 13     | tuples, `oneOf` objects, recursion (`$ref` becomes `z.any()`), closed `patternProperties`, literal patterns, `dependentRequired` |

On the OpenAPI document, genever passed 10 of 10 probes and [openapi-typescript](https://www.npmjs.com/package/openapi-typescript) 7.13.0 passed 9, missing only the literal pattern.

The other rows are a snapshot: what each tool did that night, at the version shown. When one of them ships a fix, the next run picks it up. Only genever's results are asserted by the comparison's tests.

Generating from a schema of 500 definitions took genever 54 ms, json-schema-to-typescript 141 ms and quicktype 295 ms (median of 5 runs, on a shared CI runner, so only compare within one run). The tools that infer types aren't timed, since their cost is paid while type-checking.

The live report, from last night's run, with the failed probes on hover:

<GeneverComparison />

## Where I'd use the others

If the same schema feeds Go, Swift or Kotlin code, use quicktype: it generates for many languages and can infer a schema from sample JSON, and genever only writes TypeScript. If you want runtime checks and the schema has no `$ref`s, json-schema-to-zod gives you a Zod validator with the type attached, one generated file instead of a type plus a separate validator. json-schema-to-ts and TypeBox have no build step, which matters when the schema is already written in TypeScript; if it is, [Juniper](/packages/juniper/) is my version of that, with the same types genever generates. And openapi-typescript has more built around it, openapi-fetch for one; genever's `Paths` and `Operations` types are shaped like its output.

## Run it yourself

The comparison is [a package in the repository](https://github.com/JacobLey/leyman/tree/main/e2e/genever-comparison), and the nightly job runs it with [Dagger](https://dagger.io/), so a clone, Docker and the Dagger CLI are enough to run the same thing:

```sh
git clone https://github.com/JacobLey/leyman.git && cd leyman
dagger call comparison-report --commit="$(git rev-parse HEAD)" export --path ./genever.json
```

Versions are pinned in the lockfile, so running the same commit gives the same versions as the table.

## Try it

```sh
npx genever schema.json --name MyType
```

Commit the output, and run `genever --ci` in CI to fail when it's out of date. [Getting started](/packages/genever/getting-started) covers the rest, including [OpenAPI documents](/packages/genever/guides/openapi) and [references to other files](/packages/genever/guides/references).

A type doesn't check anything at runtime. `minLength`, `format` and most patterns have no TypeScript equivalent, so data still needs a validator: [Ajv](https://ajv.js.org/) or [juniper-validator](/packages/juniper-validator/).
