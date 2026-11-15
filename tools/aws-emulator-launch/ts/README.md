<div style="text-align:center">

# aws-emulator-launch

Starts AWS Emulator for tests, on a free port, and returns its endpoint, credentials and certificate authority.

[![npm package](https://badge.fury.io/js/aws-emulator-launch.svg)](https://www.npmjs.com/package/aws-emulator-launch)
[![License](https://img.shields.io/npm/l/aws-emulator-launch.svg)](https://github.com/JacobLey/leyman/blob/main/tools/aws-emulator-launch/ts/LICENSE)

</div>

[AWS Emulator](https://docs.aws.amazon.com/emulator/latest/userguide/getting-started.html) runs AWS services (DynamoDB, SQS, EventBridge and more) on your own machine. It serves them over HTTPS, with a certificate authority it makes for each run, and checks that requests are signed with keys it also makes for each run. So before a test can send its first request, it needs to know where the emulator listens, which certificate authority to trust, and which keys to sign with.

Ideally each test process starts an emulator of its own, on a port nothing else uses, and stops it at the end. The emulator keeps everything in memory and starts in about 150 ms, so that costs little, and parallel runs never see each other's tables or queues.

`aws-emulator-launch` starts the emulator that way and waits until it serves requests. It returns the endpoint, the region, the run's keys and the certificate authority, which you pass to an AWS SDK client. Authentication stays on, as it is on AWS, and the emulator gets an idle timeout, so one left behind by a crashed test process exits on its own. It works with any test runner, since it is a plain async function with no dependencies.

It doesn't install the emulator: install it as AWS describes. It needs version 1.0.290 or later, since earlier releases log a different line once they start. For a local environment you keep running, start the emulator from its own command line instead.

A [Go module](https://github.com/JacobLey/leyman/tree/main/tools/aws-emulator-launch/go) does the same for Go tests.

Guides and the full reference are on the [docs site](https://jacobley.github.io/leyman/packages/aws-emulator-launch/).

## Contents

- [Install](#install)
- [Example](#example)
- [Usage](#usage)
- [API](#api)
- [Also See](#also-see)

## Install

```sh
npm i -D aws-emulator-launch
```

## Example

```ts
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
await dynamodb.listTables({});
```

## Usage

The package is ESM only, and runs on Node.js 22.12 or later. It runs `aws-emulator` from `PATH` unless you pass its path as `binary`.

In a test suite, start the emulator in a hook that runs once (Mocha's root `before`, Vitest's `globalSetup`, or `beforeAll`) and stop it in the matching hook. The emulator starts empty, so tests create the tables and queues they use, ideally under names of their own so they don't need to clean up after each other.

The emulator's usage telemetry is off for the runs it starts (`-t off`), with no option to change it, since `-t on` can't override `EMULATOR_TELEMETRY` or the emulator's config file anyway. To run the emulator with telemetry, start it from its own command line (`aws-emulator`) instead.

## API

### `launchAwsEmulator(options?)`

Starts AWS Emulator on a free port (`-p 0`) of 127.0.0.1 (`-b 127.0.0.1`, the address its certificate covers), with authentication on (`-a on`) and telemetry off (`-t off`), and waits for the line it logs once it serves requests. Lines before it, JSON or not, are ignored.

| Option           | Type     | Default          | Description                                                                                                                 |
| ---------------- | -------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `binary`         | `string` | `'aws-emulator'` | The emulator's executable, a path or a name looked up on `PATH`.                                                            |
| `idleTimeoutMs`  | `number` | `600000`         | Milliseconds without an API call after which the emulator exits on its own (`--idle-timeout`, rounded up to whole seconds). |
| `startTimeoutMs` | `number` | `10000`          | How long to wait for the startup line before killing the emulator.                                                          |

**Returns** `Promise<AwsEmulator>`.

**Rejects** with one of the errors below. Whenever it rejects after the emulator started running, it has stopped the emulator first.

### `AwsEmulator`

| Property                  | Type                               | Description                                                                                                                                                                                |
| ------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `endpoint`                | `string`                           | Where it serves every AWS API, such as `https://127.0.0.1:43085`.                                                                                                                          |
| `region`                  | `string`                           | The region of its config file (`us-east-1`).                                                                                                                                               |
| `credentials`             | `{ accessKeyId, secretAccessKey }` | The run's keys. An AWS SDK client takes this object as its `credentials`.                                                                                                                  |
| `ca`                      | `string`                           | Its certificate authority as PEM, for `new https.Agent({ ca })` or any other client that takes one.                                                                                        |
| `caFile`                  | `string`                           | The path of the same certificate authority, for a client that only takes a file. The emulator deletes it when it stops.                                                                    |
| `stop()`                  | `() => Promise<void>`              | Sends `SIGTERM`, which makes the emulator delete its files and exit, and resolves once it has exited. Calling it again, or after the emulator exited on its own, only waits for that exit. |
| `[Symbol.asyncDispose]()` | `() => Promise<void>`              | The same as `stop()`, for `await using`.                                                                                                                                                   |

### Errors

Every error extends `AwsEmulatorError`.

| Error                          | When                                                                                                                                                 | Properties                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `AwsEmulatorNotRunError`       | The binary couldn't be run, most often because it isn't installed or isn't on `PATH`. The message links AWS's install guide.                         | `binary`, and the spawn error as `cause`                       |
| `AwsEmulatorExitError`         | The emulator exited before it started, for instance on an option it doesn't know.                                                                    | `code`, `signal`, and `output` (its standard output and error) |
| `AwsEmulatorStartTimeoutError` | No startup line within `startTimeoutMs`, so the emulator was killed (`SIGKILL`). A release before 1.0.290 always ends here, and the message says so. | `timeoutMs`, `output`                                          |
| `AwsEmulatorFileError`         | A file the startup line names couldn't be read, or lacks the region or a key.                                                                        | `file`                                                         |

## Also See

- [`idempotency-keys`](https://www.npmjs.com/package/idempotency-keys) tests its DynamoDB store with this package.
- [AWS Emulator's command line reference](https://docs.aws.amazon.com/emulator/latest/userguide/cli-reference.html), for the options this package sets.
