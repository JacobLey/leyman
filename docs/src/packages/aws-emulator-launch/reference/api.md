---
description: launchAwsEmulator, its options, the AwsEmulator it returns, and its errors.
---

# API

## `launchAwsEmulator(options?)`

Starts AWS Emulator on a free port (`-p 0`), with authentication on (`-a on`), and waits for the line it logs once it serves requests. Lines before it, JSON or not, are ignored. It then reads the files that line names: the certificate authority, the config (for the region) and the run's keys beside it.

| Option               | Type      | Default          | Description                                                                                         |
| -------------------- | --------- | ---------------- | --------------------------------------------------------------------------------------------------- |
| `binary`             | `string`  | `'aws-emulator'` | The emulator's executable, a path or a name looked up on `PATH`.                                    |
| `idleTimeoutSeconds` | `number`  | `600`            | Seconds without an API call after which the emulator exits on its own (`--idle-timeout`).           |
| `startTimeoutMs`     | `number`  | `10000`          | How long to wait for the startup line before killing the emulator.                                  |
| `telemetry`          | `boolean` | `false`          | `false` turns telemetry off for the run (`-t off`). `true` leaves it to the emulator's own setting. |

**Returns** `Promise<AwsEmulator>`. When it rejects after the emulator started running, it has stopped the emulator first.

The emulator's usage telemetry is off by default, as AWS asks of tools that start the emulator for you. With `telemetry: true` it follows the emulator's own setting, which is on unless `EMULATOR_TELEMETRY` or its config file turns it off.

## `AwsEmulator`

| Property                  | Type                               | Description                                                                                                                                                                                |
| ------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `endpoint`                | `string`                           | Where it serves every AWS API, such as `https://127.0.0.1:43085`.                                                                                                                          |
| `region`                  | `string`                           | The region of its config file (`us-east-1`).                                                                                                                                               |
| `credentials`             | `{ accessKeyId, secretAccessKey }` | The run's keys. An AWS SDK client takes this object as its `credentials`.                                                                                                                  |
| `ca`                      | `string`                           | Its certificate authority as PEM.                                                                                                                                                          |
| `caFile`                  | `string`                           | The path of the same certificate authority, for a client that only takes a file. Deleted when the emulator stops.                                                                          |
| `stop()`                  | `() => Promise<void>`              | Sends `SIGTERM`, which makes the emulator delete its files and exit, and resolves once it has exited. Calling it again, or after the emulator exited on its own, only waits for that exit. |
| `[Symbol.asyncDispose]()` | `() => Promise<void>`              | The same as `stop()`, for `await using`.                                                                                                                                                   |

## Errors

Every error extends `AwsEmulatorError`.

| Error                     | When                                                                                                                                                 | Properties                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `AwsEmulatorSpawnError`   | The binary couldn't be run, most often because it isn't installed or isn't on `PATH`. The message links AWS's install guide.                         | `binary`, and the spawn error as `cause` |
| `AwsEmulatorExitError`    | The emulator exited before it started, for instance on an option it doesn't know.                                                                    | `code`, `signal`, `output`               |
| `AwsEmulatorTimeoutError` | No startup line within `startTimeoutMs`, so the emulator was killed (`SIGKILL`). A release before 1.0.290 always ends here, and the message says so. | `timeoutMs`, `output`                    |
| `AwsEmulatorFileError`    | A file the startup line names couldn't be read, or lacks the region or a key.                                                                        | `file`                                   |

`output` is what the emulator wrote to its standard output and error before it failed.

```ts
import { AwsEmulatorSpawnError, launchAwsEmulator } from 'aws-emulator-launch';

try {
    await launchAwsEmulator();
} catch (error) {
    if (error instanceof AwsEmulatorSpawnError) {
        throw new Error('aws-emulator is missing: rebuild the devcontainer', { cause: error });
    }
    throw error;
}
```
