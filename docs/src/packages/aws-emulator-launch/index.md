---
description: Starts AWS Emulator for tests, on a free port, and returns its endpoint, credentials and certificate authority.
---

# aws-emulator-launch

<ProjectHeader />

[AWS Emulator](https://docs.aws.amazon.com/emulator/latest/userguide/getting-started.html) runs AWS services (DynamoDB, SQS, EventBridge and more) on your own machine. It serves them over HTTPS, with a certificate authority it makes for each run, and checks that requests are signed with keys it also makes for each run. So before a test can send its first request, it needs to know where the emulator listens, which certificate authority to trust, and which keys to sign with.

aws-emulator-launch starts an emulator for one test process, on a free port, waits until it serves requests, and gives you all three:

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

await using emulator = await launchAwsEmulator();

const dynamodb = new DynamoDB({
    endpoint: emulator.endpoint,
    region: emulator.region,
    credentials: emulator.credentials,
    requestHandler: { httpsAgent: new Agent({ ca: emulator.ca }) },
});
```

**[Get started →](/packages/aws-emulator-launch/getting-started)**

## Features

- Each run gets a free port, so parallel test processes each have an emulator of their own and never see each other's tables or queues.
- Authentication stays on, as it is on AWS, so a request your code forgot to sign fails in tests too.
- The emulator gets an idle timeout, so one left behind by a crashed test process exits on its own.
- Only the line the emulator logs once it serves requests is read, and the rest of its output is ignored. When it fails to start, the error says why, with the emulator's output.
- It is a plain async function with no dependencies, so it works with Mocha, Vitest or any other runner.
- A [Go module](/packages/aws-emulator-launch/guides/go) starts it the same way for Go tests.

It doesn't install the emulator, and needs version 1.0.290 or later. For a local environment you keep running, start the emulator from its own command line instead.

## Related

<ProjectRelated />
