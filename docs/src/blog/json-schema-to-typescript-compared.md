---
title: "JSON Schema to TypeScript: six tools, one set of type checks"
description: "genever, json-schema-to-typescript, quicktype, json-schema-to-zod, json-schema-to-ts and TypeBox, given the same schema every night, with each generated type checked against valid values, invalid values and reads."
date: 2026-11-07
packages: [genever, juniper]
---

# JSON Schema to TypeScript: six tools, one set of type checks

<PostHeader />

A JSON Schema can say more than most generated TypeScript types do. A tuple of two numbers becomes `number[]`, an ID that must start with `ord_` becomes `string`, and an object that only allows `x-` headers takes any key. The type still compiles, but it accepts values the schema rejects, so the mistakes it should catch reach runtime.

I wrote [genever](/packages/genever/) to close that gap, and to see whether it does, a nightly job gives it and the most-used alternatives the same schema, then checks each generated type. This post covers how the checks work, what the latest run found, and where the other tools are the better choice.

## The same schema, two outputs

Here's a schema for an order. Each property uses a JSON Schema feature that TypeScript can express:

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

The `oneOf` union is right. The rest is wider or wrong: `location` is `never[]`, so even a valid `[1, 2]` fails to compile (2020-12's `prefixItems` isn't read). `id` and `headers` take any string, and `payment` allows a card without a billing address.

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

Showing one schema is easy to cherry-pick, so the comparison is automated, and runs every night in CI. Every tool gets [the same documents](https://github.com/JacobLey/leyman/blob/main/e2e/genever-comparison/src/documents.ts): one JSON Schema with a property per feature (nullable values, mixed enums, tuples, `oneOf` objects, recursion, closed `patternProperties`, literal patterns and `dependentRequired`), and an OpenAPI 3.1 document for the tools that read OpenAPI.

Each [probe](https://github.com/JacobLey/leyman/blob/main/e2e/genever-comparison/src/probes.ts) is one line of TypeScript, compiled against the generated type:

- **accepts**: a value the schema allows must type-check.
- **rejects**: a value the schema forbids must fail to.
- **reads**: reading a value must give exactly the right type, compared with an identity check, so `any` doesn't pass.

The rejecting probes are what most comparisons skip. Any type accepts the valid values if it's wide enough: `any` passes every one of them.

[json-schema-to-ts](https://www.npmjs.com/package/json-schema-to-ts) and [TypeBox](https://www.npmjs.com/package/typebox) infer types inside TypeScript instead of writing a file, so they get the schema pasted in `as const`. That's the best case for them: imported from a `.json` file, TypeScript widens the schema, and json-schema-to-ts gives `unknown`.

## What the latest run found

From the run of 2026-11-06, JSON Schema probes passed (out of 23):

| Tool                      | Version | Passed | Missed                                                                                                                           |
| ------------------------- | ------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| genever                   | 0.10.1  | 23     |                                                                                                                                  |
| json-schema-to-typescript | 16.0.0  | 18     | tuples, closed `patternProperties`, literal patterns, `dependentRequired`                                                        |
| quicktype                 | 26.0.0  | 17     | tuple length, narrowing `oneOf` objects, closed `patternProperties`, literal patterns, `dependentRequired`                       |
| json-schema-to-ts         | 3.1.1   | 17     | tuples, recursion (a type error), closed `patternProperties`, literal patterns, `dependentRequired`                              |
| TypeBox                   | 1.4.3   | 17     | tuples, recursion, closed `patternProperties`, literal patterns, `dependentRequired`                                             |
| json-schema-to-zod        | 2.8.1   | 13     | tuples, `oneOf` objects, recursion (`$ref` becomes `z.any()`), closed `patternProperties`, literal patterns, `dependentRequired` |

On the OpenAPI document, genever passed 10 of 10 probes and [openapi-typescript](https://www.npmjs.com/package/openapi-typescript) 7.13.0 passed 9, missing only the literal pattern.

Every tool handles the basics: nullable values, mixed enums. The differences are all in features JSON Schema has and TypeScript can express, but that most generators leave wider than they need to be.

Generating from a schema of 500 definitions took genever 54 ms, json-schema-to-typescript 141 ms and quicktype 295 ms (median of 5 runs, on a shared CI runner, so only compare within one run). The tools that infer types aren't timed, since their cost is paid while type-checking.

The live report, from last night's run, with the failed probes on hover:

<GeneverComparison />

## Run it yourself

The comparison is [a package in the repository](https://github.com/JacobLey/leyman/tree/main/e2e/genever-comparison), and the nightly job runs it with [Dagger](https://dagger.io/), so a clone, Docker and the Dagger CLI are enough to run the same thing:

```sh
git clone https://github.com/JacobLey/leyman.git && cd leyman
dagger call comparison-report --commit="$(git rev-parse HEAD)" export --path ./genever.json
```

Or, inside the repository's devcontainer:

```sh
nx run @leyman/e2e-genever-comparison:comparison-report
```

which writes `e2e/genever-comparison/report/genever.json`, the file the table above reads. Tool versions come from the lockfile, so a run of the same commit uses the same versions as the report.

## Caveats

- **I wrote genever, and the probes.** They test features I set out to support, so it isn't surprising genever passes them all. Each probe follows what the JSON Schema spec says a validator accepts, and the documents and probes are public: if a feature that matters to you is missing, or a probe is unfair to a tool, [open an issue](https://github.com/JacobLey/leyman/issues).
- **Only genever's results are tested.** The rest are what each tool did in that run, at the version shown. A tool improving is a change in the report, not a failure.
- **Types aren't validation.** `minLength`, `format` and most patterns have no TypeScript type, so data still needs checking at runtime, with [Ajv](https://ajv.js.org/) or [juniper-validator](/packages/juniper-validator/).

## When to use something else

- **quicktype** generates types for many languages, and infers schemas from sample JSON. For a schema shared with Go, Swift or Kotlin code, it's the tool genever isn't.
- **json-schema-to-zod** generates a validator, not only a type. If you want runtime checks and the schema has no `$ref`s, one generated file does both.
- **json-schema-to-ts and TypeBox** need no build step, which is the right trade when the schema is written in TypeScript anyway. For that case, [Juniper](/packages/juniper/) builds schemas in TypeScript with the same types genever generates, and genever gets them back once the schema has been serialized and read somewhere else.
- **openapi-typescript** has a larger ecosystem around OpenAPI (openapi-fetch, for one). genever's `Paths` and `Operations` types are shaped like its output.

## Try it

```sh
npx genever schema.json --name MyType
```

Commit the output, and run `genever --ci` in CI to fail when it's out of date. [Getting started](/packages/genever/getting-started) covers the rest, including [OpenAPI documents](/packages/genever/guides/openapi) and [references to other files](/packages/genever/guides/references).
