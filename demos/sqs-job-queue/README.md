# demo-sqs-job-queue

A job queue on SQS: retries by visibility timeout with a heartbeat for long jobs, a dead-letter queue and redrive, FIFO order per group, and duplicate deliveries skipped through idempotency-keys on DynamoDB.

A job queue lets a service hand work to workers and answer before the work is done. SQS is a good one to build on: it stores messages durably, hides a received message from other workers for a visibility timeout and delivers it again if the worker never deletes it, and moves a message that keeps failing to a dead-letter queue. But it delivers each message at least once, not exactly once, a batch send answers `200` even when some of its messages failed, and a job that runs longer than its visibility timeout is handed to a second worker while the first is still on it.

This demo builds the queue SQS leaves to you: batched sends that read each entry's result, a worker that claims each job's id through [idempotency-keys](../../tools/idempotency-keys/ts) on DynamoDB so a job runs once however many times it arrives, a heartbeat that keeps a long job hidden, FIFO order per group, and redrive from the dead-letter queue once the cause of a failure is fixed. It's plain functions over the SDK's client, as there is nothing to swap.

It's a worked example rather than a package, and isn't published. Tests run against [AWS Emulator](https://docs.aws.amazon.com/emulator/latest/userguide/getting-started.html), started by [aws-emulator-launch](../../tools/aws-emulator-launch/ts).

## Example

A FIFO queue of emails, and a worker that sends each one once:

<!-- twoslash
declare const sendEmail: (payload: unknown, signal: AbortSignal) => Promise<void>;
declare const signal: AbortSignal;
-->
```ts
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { SQS } from '@aws-sdk/client-sqs';
import { createJobQueue, createWorker, sendJobs } from '@leyman/demo-sqs-job-queue';
import { DynamoDbStore } from 'idempotency-keys/dynamodb';

const sqs = new SQS();

const queue = await createJobQueue(sqs, {
    name: 'emails',
    fifo: true,
    visibilityTimeoutMs: 30_000,
    // The fifth delivery goes to the dead-letter queue instead
    maxReceiveCount: 4,
});

// The id is the producer's, and the same every time it sends the job
await sendJobs(sqs, { queueUrl: queue.queueUrl }, [
    { id: 'welcome:42', type: 'welcome', payload: { userId: 42 }, group: 'user:42' },
]);

const worker = createWorker({
    sqs,
    queueUrl: queue.queueUrl,
    store: new DynamoDbStore({ connection: new DynamoDB() }),
    handle: async (job, jobSignal) => sendEmail(job.payload, jobSignal),
    visibilityTimeoutMs: 30_000,
    // Renewed every 10 seconds, so a few heartbeats' worth, however long a job runs
    leaseMs: 60_000,
});

await worker.run(signal);
```

## How it works

- `createJobQueue()` creates a queue with a dead-letter queue (`maxReceiveCount`), FIFO or standard. A FIFO queue's dead-letter queue is FIFO too, as SQS requires.
- `sendJobs()` sends in batches of 10. A batch answers `200` even when some messages fail, so each entry in `Failed` is read: a sender fault fails at once, anything else is sent again up to `maxAttempts`, and what still failed is thrown together as a `SendJobsError`. On FIFO, the job id is the deduplication id.
- `createWorker()` receives with long polling, and claims each job's id through idempotency-keys' `begin()` (scope the queue, a fixed operation, the fingerprint the SHA-256 of the body). A job that ran is deleted without running again; one still running is left to come back. A failed job is released and made visible again after `retryDelayMs`. While a job runs, a heartbeat every third of `visibilityTimeoutMs` extends its visibility and renews its idempotency lease (`attempt.renew()`). A heartbeat that fails at either, or finds the lease taken over (`JobLeaseLostError`), aborts the handler's signal. On FIFO, a group stops at its first job that didn't finish, and other groups go on.
- `redriveDeadLetters()` starts a message move task and waits for it to end.

`poll()` receives once and returns what became of each message (`done`, `duplicate`, `busy`, `failed`, `reused`, `invalid` or `deferred`), which is what the tests drive. `run()` polls until its signal aborts, then lets the jobs it has finish.

## What was learned

- SQS delivers at least once, so jobs are keyed by an id the producer assigns, never `MessageId`: a producer's retry sends a new message, and on AWS, a redrive gives each message a new `MessageId` too.
- FIFO deduplication lasts 5 minutes, and only for one queue; the idempotency key lasts `ttlMs` (24 hours by default), which covers standard queues and late retries.
- The heartbeat renews the idempotency lease as well as SQS visibility, so `leaseMs` only covers the time between heartbeats, plus a slow call and clock drift between workers, not the longest job. A worker that crashes stops renewing, so its job is taken over a lease later rather than a longest job later. `createWorker()` throws a `WorkerOptionError` for a `leaseMs` no longer than one heartbeat's interval, or a store without `renew`.
- A renewal that finds the job's token gone means another delivery took the job over, after a heartbeat ran so late that the lease ran out, so the worker stops the job. One that fails stops it too: the lease may run out before the next heartbeat.
- A heartbeat that fails stops the job, since another worker may have it by then. But the worker doesn't count on a heartbeat noticing that it lost the message: the emulator accepts an expired receipt handle (below), and AWS only documents that the latest handle is the one to use. The lease is what keeps two runs apart.
- On FIFO, a job that goes to the dead-letter queue lets the rest of its group through, so order is kept only among jobs that finish. A group that must stop on a failure needs that in its handler.
- A job id reused with another body (`reused`) and a body that isn't a job (`invalid`) can never succeed, so they are left to reach the dead-letter queue rather than deleted, where someone can look at them.
- The emulator can't fail a message on its side or fail a move task, and a lease can't be taken over without waiting it out, so those paths, and a renewal that fails, are tested through thin fakes, labelled as such.

## Where the emulator differs from AWS

Probed on AWS Emulator 1.0.290. The tests don't assert any of these, and the code doesn't rely on them:

- A redriven message keeps its `MessageId` and its receive count. On AWS it comes back as a new message, with a new `MessageId` and its receive count starting at 1. So deduplicate on the job id, and know that a backoff counted from `receiveCount` restarts after a redrive on AWS.
- A FIFO dead-letter copy keeps the producer's deduplication id; on AWS it takes the original `MessageId`. A move task over messages sent straight to the dead-letter queue completes; on AWS it fails.
- A batch over the size limit is refused with HTTP 413 and an empty body, not `BatchRequestTooLong`.
- An expired receipt handle still works: `ChangeMessageVisibility` returns `200`, and once another worker has received the message, extends that worker's visibility, and a delete with it deletes.

## Not covered

- Lambda's event source mapping, which receives and deletes for you, with its own batching and partial batch responses.
- Fan-out through SNS, or EventBridge in front of the queue.
- Payloads over SQS's 1 MiB limit, stored in S3 with a pointer in the message.
- High-throughput FIFO, and the partitioning it brings.
- Alarms on the dead-letter queue's depth or the age of the oldest message.
- IAM policies and encryption with KMS.

## Testing

Each test process starts its own emulator through aws-emulator-launch, creates one DynamoDB table for job ids, and gives each test queues of its own, so tests never see each other's messages. Every launcher call and SDK client is made in [`test/helpers/aws.ts`](./test/helpers/aws.ts), from the emulator's values alone, so a developer's AWS settings can't change a test. Tests drive the worker one `poll()` at a time with a `retryDelayMs` of 0 by default, so a retried job is visible again at once rather than after a delay. The heartbeat's interval is the only timer faked.
