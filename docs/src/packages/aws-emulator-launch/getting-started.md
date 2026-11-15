---
description: Install aws-emulator-launch and AWS Emulator, and start one emulator for a test run.
---

# Getting started

## Install

Install AWS Emulator 1.0.290 or later as [AWS describes](https://docs.aws.amazon.com/emulator/latest/userguide/getting-started.html), so `aws-emulator` is on `PATH`, then the package:

::: code-group

```sh [npm]
npm i -D aws-emulator-launch
```

```sh [pnpm]
pnpm add -D aws-emulator-launch
```

```sh [yarn]
yarn add -D aws-emulator-launch
```

:::

::: tip
aws-emulator-launch is ESM only, and runs in Node.js 22.12 or later.
:::

## Start one emulator for the run

Start it in a hook that runs once, and stop it in the matching hook. With [mocha-chain](/packages/mocha-chain/), a `before` at the top level of a module is a root hook, run once per process:

```ts
// @filename: node.d.ts
// Docs are type-checked without Node.js types
declare module 'node:https' {
    export class Agent {
        constructor(options: { ca: string });
    }
}
// @filename: index.ts
// ---cut---
import { Agent } from 'node:https';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { launchAwsEmulator } from 'aws-emulator-launch';
import { before } from 'mocha-chain';

export const withDynamoDb = before(async () => {
    const emulator = await launchAwsEmulator();
    const dynamodb = new DynamoDB({
        endpoint: emulator.endpoint,
        region: emulator.region,
        credentials: emulator.credentials,
        requestHandler: { httpsAgent: new Agent({ ca: emulator.ca }) },
    });
    return { emulator, dynamodb };
});
withDynamoDb.after(async ({ emulator, dynamodb }) => {
    dynamodb.destroy();
    await emulator.stop();
});
```

The emulator starts empty, so tests create the tables and queues they use. Giving each a name of its own means they don't need to clean up after each other.

If `aws-emulator` isn't installed, `launchAwsEmulator` rejects with an `AwsEmulatorNotRunError` that links AWS's install guide. A repository that installs the emulator for you (in a devcontainer, say) can catch it and say how to get it there instead.

## Next steps

- [API](/packages/aws-emulator-launch/reference/api): every option, property and error.
- [Go](/packages/aws-emulator-launch/guides/go): the same for Go tests.
