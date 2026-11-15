# aws-emulator-launch

Starts AWS Emulator for tests, on a free port, and returns its endpoint, credentials and certificate authority. There are TypeScript and Go implementations, which start it the same way.

[AWS Emulator](https://docs.aws.amazon.com/emulator/latest/userguide/getting-started.html) runs AWS services (DynamoDB, SQS, EventBridge and more) on your own machine. It serves them over HTTPS, with a certificate authority it makes for each run, and checks that requests are signed with keys it also makes for each run. So before a test can send its first request, it needs to know where the emulator listens, which certificate authority to trust, and which keys to sign with.

Ideally each test process starts an emulator of its own, on a port nothing else uses, and stops it at the end. The emulator keeps everything in memory and starts in about 150 ms, so that costs little, and parallel runs never see each other's tables or queues.

aws-emulator-launch starts the emulator that way, on a free port, with authentication on as it is on AWS, and with an idle timeout, so one left behind by a crashed test process exits on its own. It waits for the line the emulator logs once it serves requests (ignoring its other output), reads the files that line names, and returns the endpoint, the region, the run's keys and the certificate authority. When it fails, the error says why, for instance that the binary isn't installed (with a link to AWS's install guide), or that the emulator exited before it started (with its output).

It needs AWS Emulator 1.0.290 or later, which you install as AWS describes. Earlier releases log a different line once they start, so they time out. Telemetry is off for the runs it starts, unless you ask to leave it to the emulator's own setting.

## Packages

| Package | Status |
|---------|--------|
| [`ts`](./ts/) | Published to npm as [`aws-emulator-launch`](https://www.npmjs.com/package/aws-emulator-launch) |
| [`go`](./go/) | Released as the Go module `github.com/JacobLey/leyman/tools/aws-emulator-launch/go` |

The two take the same options and return the same things, in each language's conventions:

| TypeScript | Go |
|------------|----|
| `launchAwsEmulator(options?)` | `Launch(ctx, Options)` |
| `binary`, `idleTimeoutSeconds`, `startTimeoutMs`, `telemetry` | `Binary`, `IdleTimeout`, `StartTimeout`, `Telemetry` |
| `endpoint`, `region`, `credentials`, `ca`, `caFile` | `Endpoint`, `Region`, `Credentials`, `CA`, `CAFile` |
| Pass `ca` to an `https.Agent` | `HTTPClient()` |
| `stop()`, or `await using` | `Stop()` |
| `AwsEmulatorSpawnError`, `AwsEmulatorExitError`, `AwsEmulatorTimeoutError`, `AwsEmulatorFileError` | `ErrNotRun`, `ErrExited`, `ErrStartTimeout`, `ErrFile` |
