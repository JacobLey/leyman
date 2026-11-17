---
# @manual-start frontmatter
description: A transactional outbox on Postgres relayed to Amazon EventBridge, with a relay that claims rows with a lease, retries only the failures worth retrying, and wakes on NOTIFY instead of polling hard.
# @manual-end frontmatter
---

<!-- @generated-signature v1:880eba078ffb95f15501cf4275739231 Generated from demos/outbox-relay/README.md by docs/scripts/populate-docs.mjs (nx run @leyman/docs:populate-docs). Edit demos/outbox-relay/README.md instead, and the description only here. -->

# Outbox relay

<ProjectHeader />

A transactional outbox on Postgres, relayed to Amazon EventBridge by a relay that claims rows with a lease, retries only what EventBridge says is worth retrying, and wakes on `NOTIFY`.

A service often has to change its database and tell other services about it (an order is placed, so billing and shipping should hear about it). Doing both directly is a dual write: two systems, no transaction across them, so a crash or a rollback in between leaves one done and not the other. Ideally the event goes out if and only if the change commits, at least once, without the request waiting on the network and without one slow call holding database locks.

The outbox does this with the database alone. The service writes the event to an `outbox` table in the same transaction as the change, so both commit or neither does. A relay then reads committed rows and sends them, marking each one sent once EventBridge accepts it.

```
request ──► BEGIN; INSERT orders; INSERT outbox; COMMIT ──► NOTIFY outbox (at commit)
                                                               │
relay ◄── wakes on the ring, or on a poll ◄────────────────────┘
  │  claim ≤ 10 rows (lease, SKIP LOCKED, own short statement)
  ├─► PutEvents ──► bus ──► rule ──► SQS queue ──► consumer (dedupes on detail.outboxId)
  └─► sent_at / available_at (retry) / failed_at (parked)
```

It's a worked example rather than a package, and isn't published. The code is short (four files in [`src/lib`](https://github.com/JacobLey/leyman/tree/main/demos/outbox-relay/src/lib)), so most of what follows is why it's built this way.

## Example

An order and its event in one transaction, and a relay sending it:

```ts
declare const databaseUrl: string;
// ---cut---
import { EventBridge } from '@aws-sdk/client-eventbridge';
import { placeOrder, startRelay } from '@leyman/demo-outbox-relay';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: databaseUrl });

// In the request: the order and its OrderPlaced event commit together
const orderId: string = await placeOrder(pool, { customer: 'ada', totalCents: 1200 });

// In a worker (any number of them): send what's committed
const listener = new pg.Client({ connectionString: databaseUrl });
await listener.connect();
const relay = await startRelay({
    pool,
    listener,
    eventBridge: new EventBridge(),
    busName: 'orders',
    onError: error => {
        console.error('Outbox relay failed, retrying when the lease expires', error);
    },
});

// On shutdown
await relay.close();
await listener.end();
```

`placeOrder` is the example business write. A real service calls `enqueue(client, event)` inside its own transaction. The table and the trigger are in [`schema.sql`](https://github.com/JacobLey/leyman/blob/main/demos/outbox-relay/schema.sql).

## Why not publish from the transaction

The obvious alternatives each lose an event or invent one:

- Publishing before the commit (or from inside it) sends an event for a change that may still roll back, on a constraint violation or a serialization failure. One of the tests does exactly this: the event arrives, and the order doesn't exist.
- Publishing after the commit loses the event when the process dies in between.
- Calling out from the database has the same problem. On RDS, [`aws_lambda.invoke`](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL-Lambda.html#PostgreSQL-Lambda-invoke) runs when the statement runs, not at commit. Invoked asynchronously (`Event`), a rollback afterwards leaves an event for a row that never existed. Invoked synchronously (the default), the transaction holds its locks for as long as the Lambda takes, a failed Lambda aborts the write, and a retried transaction invokes it again.

The outbox moves the network call out of the transaction and makes it retryable, which is the pattern in [AWS's prescriptive guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) and [microservices.io](https://microservices.io/patterns/data/transactional-outbox.html).

## The doorbell

A statement-level trigger on `outbox` calls `pg_notify('outbox', '')`, so a writer can't forget to ring, and a bulk insert rings once. Postgres delivers a notification [only when its transaction commits](https://www.postgresql.org/docs/current/sql-notify.html), so the relay never wakes for a row it can't see yet.

On each ring the relay drains: it claims and sends batches until one comes back with fewer than 10 rows. A ring that arrives mid-drain makes it drain once more afterwards, so a row committed during a drain isn't left for the next poll.

Rings get lost (the listener reconnects, a relay starts after the commit), and leases expire with nobody ringing, so the relay also polls every `pollMs` (5 seconds by default), and drains once when it starts. If the listener dies, polling keeps delivering, just later. `NOTIFY` takes a global lock at commit, so at very high write rates, drop the trigger and poll only.

## Claiming with a lease

```sql
UPDATE outbox SET available_at = now() + $lease, attempts = attempts + 1
WHERE id IN (SELECT id FROM outbox
             WHERE sent_at IS NULL AND failed_at IS NULL AND available_at <= now()
             ORDER BY id LIMIT 10 FOR UPDATE SKIP LOCKED)
RETURNING id, source, detail_type, detail, attempts;
```

The claim is a statement of its own, committed in milliseconds. The common alternative holds `SELECT … FOR UPDATE` open while calling EventBridge, which keeps a transaction (and its snapshot, which holds back vacuum) open through a network call and the SDK's retries. Here `SKIP LOCKED` only keeps two claims running at the same moment apart, and the lease (`available_at`, 30 seconds by default) keeps a claimed row from being claimed again while it's sent. A relay that crashes mid-send leaves its rows to come back when the lease runs out. Any number of relays can run, and each row is claimed by one at a time.

The lease costs no guarantee. A held lock can't prevent duplicates either: the send can succeed and the update marking it sent fail.

Rows are marked rather than deleted, since parked rows need their columns anyway, and the partial index `outbox_pending` keeps the claim's scan to pending rows. Deleting sent rows after a few days is a cron job, not built here.

## What gets retried

`PutEvents` takes up to 10 entries and reports each one's outcome by position. A partial failure is normal: the call succeeds and some entries carry an `ErrorCode`.

- No code: the row is marked `sent_at`.
- `ThrottlingException` or `InternalFailure`, the only codes AWS calls [retryable](https://docs.aws.amazon.com/eventbridge/latest/APIReference/API_PutEventsResultEntry.html): the row waits (1 second, doubling up to 5 minutes) and goes again, up to `maxAttempts` (10).
- Anything else (`MalformedDetail`, `InvalidArgument`, `NotAuthorizedForSourceException`): the same entry fails the same way again, so the row is parked in `failed_at` with the code in `last_error`, for someone to fix and requeue (`UPDATE outbox SET failed_at = NULL …`).

When the whole call fails (the network, or a request EventBridge refuses as a whole), `relayOnce` rejects and records nothing, and the rows come back when their lease expires. A request over 1 MiB in total is refused as a whole, so `schema.sql` caps one row's detail at 256 KiB, which keeps one large event from failing every batch it's in.

## At least once

Every event can arrive more than once: the relay can crash after EventBridge accepted a batch, and then the rows are sent again when their lease expires. The relay adds the row's id to the detail as `outboxId`, and consumers drop the ones they've seen (for example with [idempotency-keys](/packages/idempotency-keys/)).

EventBridge's own event `id` can't be used for this: it's new on every `PutEvents` call. For the same reason, a FIFO queue's content-based deduplication doesn't catch a resend, since the body it hashes includes that `id`. The tests show both copies arriving on a FIFO queue.

No order is promised. EventBridge doesn't keep one, a retry sends a row after later ones, and identity values commit out of order, which is also why the claim selects rows by state rather than by a "highest id sent" cursor ([a cursor skips rows](https://brandur.org/job-drain)).

## Silent drops

Two mistakes lose events without any failure from `PutEvents` (`FailedEntryCount` is 0):

- A queue whose policy doesn't let `events.amazonaws.com` call `sqs:SendMessage` (scoped to the rule's ARN). EventBridge [needs that permission](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-use-resource-based.html#eb-sqs-permissions), and without it the delivery fails after `PutEvents` returned.
- A bus name that doesn't exist.

The relay can't see either, so marks those rows sent. Catch them outside it: a canary rule on the bus that counts what arrives, and CloudWatch's `FailedInvocations` metric for the rule.

## Not covered

- Purging sent rows.
- Change data capture (Debezium, logical replication) instead of a relay: it reads the WAL rather than polling a table, at the cost of running it.
- A dead-letter queue for the rule's target. AWS Emulator doesn't emulate the failed-delivery path, so it isn't tested here.

## Testing

The tests run against a Postgres database of its own per test, from [pg-dolly](/packages/pg-dolly/), and AWS Emulator, started once per test run with [aws-emulator-launch](/packages/aws-emulator-launch/). Each test reads what arrived from SQS queues subscribed to a bus of its own, so nothing is deleted between tests.

- Nothing waits on time. A lease or retry delay is ended by setting `available_at` in the past in SQL, the doorbell test sets a poll of an hour, and the test for a ring mid-drain holds the first `PutEvents` until it has seen the ring.
- What the emulator can produce is real: `MalformedDetail` for a detail that isn't an object, `NotAuthorizedForSourceException` for a source starting `aws.`, the silent drop without a queue policy, and FIFO delivery.
- What it can't is faked, in [`test/helpers/fake-event-bridge.ts`](https://github.com/JacobLey/leyman/blob/main/demos/outbox-relay/test/helpers/fake-event-bridge.ts), each wrapping the real client: a throttled entry (it has no fault injection, and every entry failure it can be made to report isn't retryable), and a response lost after the events were sent.
- Every SDK client is built in [`test/helpers/aws.ts`](https://github.com/JacobLey/leyman/blob/main/demos/outbox-relay/test/helpers/aws.ts) from the emulator's endpoint, keys and certificate, never from the environment.
