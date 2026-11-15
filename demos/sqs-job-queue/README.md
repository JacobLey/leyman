# SQS job queue

A job queue on SQS: retries by visibility timeout with a heartbeat for long jobs, a dead-letter queue and redrive, FIFO order per group, and duplicate deliveries skipped through idempotency-keys on DynamoDB.

It's a worked example rather than a package, and isn't published. Tests run against [AWS Emulator](https://github.com/aws/aws-emulator), started by [aws-emulator-launch](../../tools/aws-emulator-launch/ts).

## How it works

- `createJobQueue()` creates a queue with a dead-letter queue (`maxReceiveCount`), FIFO or standard.
- `sendJobs()` sends in batches of 10. A batch answers `200` even when some messages fail, so each entry in `Failed` is read: a sender fault fails at once, anything else is sent again up to `maxAttempts`. On FIFO, the job id is the deduplication id.
- `createWorker()` receives, and claims each job's id through idempotency-keys' `begin()` (scope the queue, a fixed operation, the fingerprint the SHA-256 of the body). A job that ran is deleted without running again; one still running waits. A failed job is released and made visible after `retryDelayMs`. While a job runs, a heartbeat extends its visibility every third of `visibilityTimeoutMs`. On FIFO, a group stops at its first job that didn't finish.
- `redriveDeadLetters()` starts a message move task and waits for it to end.

## What was learned

- SQS delivers at least once, so jobs are keyed by an id the producer assigns, never `MessageId`: on AWS, a redrive gives each message a new one (the emulator keeps it).
- FIFO deduplication lasts 5 minutes; the idempotency key lasts `ttlMs` (24 hours by default), which covers standard queues and late retries.
- The heartbeat extends SQS visibility, not the idempotency lease, which can't be renewed. `leaseMs` must cover the longest job plus clock drift, and the worker stops a job at the last heartbeat before its lease runs out.
- The emulator can't fail a message on its side or fail a move task, so those paths are tested through thin fakes, labelled as such.
