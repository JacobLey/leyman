---
"aws-emulator-launch": minor
---

First release: `launchAwsEmulator()` starts AWS Emulator on a free port for tests, with authentication on and telemetry off, and returns its endpoint, region, keys and certificate authority, with `awsClientConfig()` for an AWS SDK client of it and `stop()` (or `await using`) to end it, which escalates to `SIGKILL` after `stopTimeoutMs`. A malformed option (an idle timeout that isn't a positive whole number of seconds, say) is an `AwsEmulatorOptionError`. Needs AWS Emulator 1.0.290 or later.
