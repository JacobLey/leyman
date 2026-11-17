# demo-webhook-receiver

A Standard Webhooks receiver: signatures checked in constant time, a timestamp window against replays, duplicate deliveries dropped through idempotency-keys on DynamoDB, and the work sent to SQS behind a fast 202.

A webhook is a request another service sends you when something happens: an invoice is paid, a build finishes. Receiving one looks like a single `POST` handler, but the sender is on the open internet and retries whenever it doesn't hear back in time. So the handler has to prove the request came from the sender, refuse an old request replayed by someone who captured it, do the work once however many times the event arrives, and answer within seconds, whatever the work costs.

This demo does each of those with one tool: [Standard Webhooks](https://www.standardwebhooks.com/) signatures through [iso-crypto](../../tools/iso-crypto)'s `verifyHmac`, [idempotency-keys](../../tools/idempotency-keys/ts) on DynamoDB for the event ids, and SQS for the work. The receiver is a plain fetch handler (`Request` in, `Response` out), so it mounts in Hono, `@hono/node-server`, or anything else that speaks fetch.

It's a worked example rather than a package, and isn't published.

## Example

A receiver for one sender, keeping event ids for 7 days:

<!-- twoslash
declare const process: { env: Record<string, string> };
-->
```ts
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { SQS } from '@aws-sdk/client-sqs';
import { createWebhookReceiver } from '@leyman/demo-webhook-receiver';
import { IdempotencyKeys } from 'idempotency-keys';
import { DynamoDbStore } from 'idempotency-keys/dynamodb';

const day = 24 * 60 * 60 * 1000;

const receive = createWebhookReceiver({
    // The scope of its event ids, so two senders' ids never collide
    source: 'billing',
    // `whsec_...`, as the sender shows it. Two while rotating
    secrets: [process.env.BILLING_WEBHOOK_SECRET],
    idempotencyKeys: new IdempotencyKeys({
        store: new DynamoDbStore({ connection: new DynamoDB() }),
        ttlMs: 7 * day,
        leaseMs: 10_000,
        waitMs: 2000,
    }),
    sqs: new SQS(),
    queueUrl: process.env.BILLING_QUEUE_URL,
});

// With Hono: app.post('/webhooks/billing', c => receive(c.req.raw))
export { receive };
```

A worker reads the queue: the [SQS job queue demo](../sqs-job-queue) is that side, including how it drops the duplicates that still get through.

## How a delivery flows

```text
POST ─▶ read the body once, as bytes
     ─▶ verify the timestamp and signature ──── refused ──▶ 400 / 401   (nothing claimed)
     ─▶ begin(source, event id, body)
          ├─ replay   ──▶ 202                    (sent before: not sent again)
          ├─ conflict ──▶ 409                    (being sent right now: the retry replays)
          ├─ mismatch ──▶ 422                    (same id, another body: a sender bug)
          └─ run      ─▶ SendMessage
                           ├─ ok      ─▶ store 202 ─▶ 202
                           ├─ refused ─▶ store 422 ─▶ 422   (a body SQS can't carry: the retry replays)
                           └─ fail    ─▶ release   ─▶ 503   (the retry sends it)
```

| Status | When                                                                                                                        |
| ------ | --------------------------------------------------------------------------------------------------------------------------- |
| `202`  | Sent to the queue now, or a duplicate of an event already sent                                                              |
| `400`  | A `webhook-id`, `webhook-timestamp` or `webhook-signature` header missing or empty, or a timestamp that isn't whole seconds |
| `401`  | No signature matches, or the timestamp is more than 5 minutes off (`toleranceMs`)                                           |
| `409`  | The same event is being sent by another request                                                                             |
| `422`  | An event id seen before with a different body, or a body SQS refuses to carry (`InvalidMessageContents`)                    |
| `503`  | SQS failed to take the message for any other reason                                                                         |

A failure of DynamoDB rejects, and so does a release that fails after SQS failed (its lease then runs out, and the retry after it sends). Fetch servers answer a rejection with `500`, which the sender retries like any other failure.

## Each step, and its pitfall

### Read the raw body

The signature covers the bytes as sent. Parsing the JSON and serializing it again changes spacing and key order, so the receiver reads `request.arrayBuffer()` once and verifies and sends those bytes.

### Verify the signature

Standard Webhooks signs `id.timestamp.body` with HMAC-SHA256 and sends `v1,<base64>` in `webhook-signature` ([spec](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md#signature-scheme)). Three things go wrong often:

- The secret is `whsec_` and the key in base64. The HMAC is keyed with the decoded bytes, not the string. `parseWebhookSecret` decodes it, and refuses one that isn't 24 to 64 bytes, at start-up rather than on the first delivery.
- The header can carry several signatures, separated by spaces: a sender rotating its secret signs with both. Every `v1` signature is checked against every secret the receiver holds, and any match passes, so a rotation never needs both sides to switch at once. Signatures of other versions are ignored, so a sender can add a scheme without breaking receivers.
- A plain `===` on two signatures returns as soon as a byte differs, which leaks how much of a forgery was right. `verifyHmac` compares in constant time (`timingSafeEqual` on Node.js, `crypto.subtle.verify` in browsers).

`signWebhook` signs as a sender does, which is how the tests make deliveries.

### Check the timestamp, both ways

A captured request has a valid signature forever. The timestamp is signed too, so a receiver refuses one more than 5 minutes from its clock, which is the reference libraries' default. In both directions: a timestamp in the future would otherwise be replayable until it went stale. The clock is an option (`now`), so the tests never wait.

The window isn't the deduplication. A sender's retry is a new request with a fresh timestamp and signature, and retries go on for days ([about 3 for Stripe](https://docs.stripe.com/webhooks#automatic-retries)). The spec suggests keeping ids for the tolerance only, which would let a retry an hour later through. Keep them for 7 days (`ttlMs`).

### Claim the event id

The event id (`webhook-id`) is the same on every retry. The receiver claims it with idempotency-keys' `begin()`, after verifying, so an unsigned request can't take an id, and before sending, so two concurrent copies send one message:

- The scope is the sender (`source`), so two senders' ids never collide.
- The operation is fixed (`webhook`).
- The fingerprint covers the body only, since the timestamp and signature change on every retry. The same id with another body is a mismatch (`422`): the sender reused an id, and sending either would hide it.

`begin()` rather than `handle()`: `handle()` reads only the `Idempotency-Key` header, and its default policy stores a `5xx` response, which would replay a failure to every retry. `waitMs` stays short (2 s), since senders time out within 10 to 30 seconds: a copy that waits longer answers `409`, and the sender retries.

### Send to SQS, then answer

The work happens later, on a worker: the receiver only sends the body to the queue, with the event id and sender as message attributes, stores its `202` and answers. When SQS fails, the receiver releases the id before answering `503`. Otherwise the stored claim would drop the sender's retry, and the event with it.

One refusal is different: SQS allows [only some Unicode characters](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_SendMessage.html) in a body, and refuses a body with others as `InvalidMessageContents`. Every retry carries the same body, so `503` would have the sender retry for days, each time failing at SQS. The receiver stores `422` for it instead, like a reused id: a sender bug. [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md) senders retry every answer but `2xx`, so the retries still come, but each replays `422` from the store without calling SQS, and the failure shows in the sender's delivery log. Answering `2xx` would stop them, and lose the event without a trace.

## At least once, not exactly once

The receiver cuts duplicates, but some still reach the queue. If the process dies after `SendMessage` and before the `202` is stored, the claim's lease runs out (10 s), and the sender's retry sends the event again. SQS standard queues also deliver a message more than once on their own. So the worker dedupes on the `webhook-id` and `webhook-source` attributes too. A FIFO queue with the event id as `MessageDeduplicationId` would only cover [5 minutes](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/using-messagededuplicationid-property.html), not a retry hours later.

## Not covered

- Other signing formats: Stripe's `Stripe-Signature`, GitHub's `X-Hub-Signature-256` (which signs no timestamp), and Standard Webhooks' asymmetric `v1a` signatures.
- Bodies that aren't UTF-8. The message body is the delivery decoded as text, which suits JSON, the format Standard Webhooks payloads use.
- IP allowlists, rate limits and a size limit on the body: the server in front of the handler is the place for those.

## Testing

The tests run against AWS Emulator, started once per test process through [aws-emulator-launch](../../tools/aws-emulator-launch/ts), which the devcontainer and Dagger's test container install. SQS and DynamoDB are real; nothing is mocked.

- [`test/helpers/aws.ts`](./test/helpers/aws.ts) holds every call to the launcher and every SDK client. Clients are built from the emulator's endpoint, region, keys and certificate authority only, never the default credential chain.
- The run creates one idempotency table, and each test a queue of its own and event ids of its own, so tests never see each other's messages.
- The clock is injected, so the timestamp window is tested at its exact edges without waiting. The signature tests also check Standard Webhooks' published test vector.
- The concurrent duplicate is ordered, not raced: an SQS client wrapped by the test holds the first delivery inside `SendMessage` while the second arrives, so the second gets `409` every time, and a retry after the first finishes replays.
- SQS refusing is a real refusal: a queue URL that doesn't exist, and a body with U+FFFF, which the emulator refuses as `InvalidMessageContents` like SQS.
