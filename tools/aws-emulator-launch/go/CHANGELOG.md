# aws-emulator-launch-go

## 0.1.0

- First release: `Launch` starts AWS Emulator on a free port for tests, with authentication on and telemetry off, and returns its endpoint, region, keys and certificate authority, an `HTTPClient` that trusts it, and `Stop` to end it. Needs AWS Emulator 1.0.290 or later.
