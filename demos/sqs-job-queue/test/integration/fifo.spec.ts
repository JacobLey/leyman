import type { JobHandler, ReceivedJob, WorkerOptions } from '@leyman/demo-sqs-job-queue';
import type { AwsContext } from '#test/helpers/aws.js';
import pDefer from 'p-defer';
import sinon from 'sinon';
import {
    createJobQueue,
    createWorker,
    redriveDeadLetters,
    sendJobs,
} from '@leyman/demo-sqs-job-queue';
import { expect } from '@leyman/expect';
import { suite } from 'mocha-chain';
import { createStore, uniqueName, withAws } from '#test/helpers/aws.js';
import { peek, pollJobs } from '#test/helpers/queue.js';

/**
 * Worker options for a queue, with short polls and retries delivered at once.
 *
 * @param context - The run's clients and table
 * @param queueUrl - URL of the queue to work on
 * @param handle - Handler of each job
 * @returns Options for a test to override
 */
const options = (context: AwsContext, queueUrl: string, handle: JobHandler): WorkerOptions => ({
    handle,
    queueUrl,
    sqs: context.sqs,
    store: createStore(context),
    visibilityTimeoutMs: 30_000,
    leaseMs: 60_000,
    retryDelayMs: () => 0,
    waitTimeMs: 0,
});

const groupA = [
    { id: 'a-1', type: 'step', payload: 1, group: 'a' },
    { id: 'a-2', type: 'step', payload: 2, group: 'a' },
];

suite('FIFO queue', () => {
    const withQueue = withAws.beforeEach(async ({ sqs }) => ({
        queue: await createJobQueue(sqs, {
            name: uniqueName(),
            fifo: true,
            visibilityTimeoutMs: 30_000,
            maxReceiveCount: 5,
        }),
    }));

    withQueue.test('Runs each group in order, without holding up other groups', async context => {
        const { sqs, queue } = context;
        const ran: string[] = [];
        let isFailedOnce = false;
        const worker = createWorker({
            sqs,
            queueUrl: queue.queueUrl,
            store: createStore(context),
            handle: async ({ id }: ReceivedJob) => {
                if (id === 'a-1' && !isFailedOnce) {
                    isFailedOnce = true;
                    throw new Error('Failed');
                }
                ran.push(id);
            },
            visibilityTimeoutMs: 30_000,
            leaseMs: 60_000,
            retryDelayMs: () => 0,
            waitTimeMs: 0,
        });
        await sendJobs(sqs, queue, [
            { id: 'a-1', type: 'step', payload: 1, group: 'a' },
            { id: 'a-2', type: 'step', payload: 2, group: 'a' },
            { id: 'b-1', type: 'step', payload: 1, group: 'b' },
        ]);

        // A receive takes the head of each group, and what follows it in its group, in order
        expect(await pollJobs(worker)).to.deep.equal([
            { jobId: 'a-1', outcome: 'failed' },
            { jobId: null, outcome: 'deferred' },
            { jobId: 'b-1', outcome: 'done' },
        ]);
        expect(await pollJobs(worker)).to.deep.equal([
            { jobId: 'a-1', outcome: 'done' },
            { jobId: 'a-2', outcome: 'done' },
        ]);
        expect(ran).to.deep.equal(['b-1', 'a-1', 'a-2']);
    });

    withQueue.test('Drops a job sent again within 5 minutes', async ({ sqs, queue }) => {
        const job = { id: 'job-1', type: 'email', payload: {}, group: 'a' };
        await sendJobs(sqs, queue, [job]);
        await sendJobs(sqs, queue, [job]);

        expect(await peek(sqs, queue.queueUrl)).to.deep.equal([
            // Without its group, which SQS carries itself
            '{"id":"job-1","type":"email","payload":{}}',
        ]);
    });

    withQueue.test('Defers the rest of a group after a job whose lease was lost', async context => {
        const { sqs, queue } = context;
        const ran: string[] = [];
        const store = createStore(context);
        let completions = 0;
        const worker = createWorker({
            ...options(context, queue.queueUrl, async ({ id }) => {
                ran.push(id);
            }),
            store: {
                claim: async params => store.claim(params),
                release: async (identity, token) => store.release(identity, token),
                renew: async params => store.renew!(params),
                // A fake for the first job: the record no longer holds its token, as after another delivery took it
                // over, which has its group now
                complete: async (identity, token, response) => {
                    completions++;
                    return completions > 1 && store.complete(identity, token, response);
                },
            },
        });
        await sendJobs(sqs, queue, groupA);

        expect(await pollJobs(worker)).to.deep.equal([
            { jobId: 'a-1', outcome: 'lost' },
            { jobId: null, outcome: 'deferred' },
        ]);
        expect(await pollJobs(worker)).to.deep.equal([{ jobId: 'a-2', outcome: 'done' }]);
        expect(ran).to.deep.equal(['a-1', 'a-2']);
    });

    withQueue.test('Defers the rest of a group even when SQS refuses to show it', async context => {
        const { sqs, queue } = context;
        const store = createStore(context);
        const worker = createWorker({
            ...options(context, queue.queueUrl, async () => {}),
            // A fake: SQS refuses the deferral's visibility change, as it may for a stale receipt handle
            sqs: {
                receiveMessage: async (input, requestOptions) =>
                    sqs.receiveMessage(input, requestOptions),
                deleteMessage: async input => sqs.deleteMessage(input),
                changeMessageVisibility: async input => {
                    if (input.VisibilityTimeout === 0) {
                        throw new Error('MessageNotInflight');
                    }
                    return sqs.changeMessageVisibility(input);
                },
            },
            store: {
                claim: async params => store.claim(params),
                release: async (identity, token) => store.release(identity, token),
                renew: async params => store.renew!(params),
                // A fake: the record no longer holds the token, as after another delivery took the job over
                complete: async () => false,
            },
        });
        await sendJobs(sqs, queue, groupA);

        expect(await pollJobs(worker)).to.deep.equal([
            { jobId: 'a-1', outcome: 'lost' },
            { jobId: null, outcome: 'deferred' },
        ]);
    });

    suite('Heartbeat', () => {
        // Only the heartbeat's interval is faked: the SDK's own timers and clock stay real
        const withClock = withQueue.beforeEach(() => ({
            clock: sinon.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }),
        }));
        withClock.afterEach(({ clock }) => {
            clock.restore();
        });

        withClock.test("Keeps the rest of a running job's group hidden too", async context => {
            const { sqs, queue, clock } = context;
            const started = pDefer();
            const finish = pDefer();
            const jobs = new Map<string, string>();
            const changes: { readonly job: string; readonly seconds: number }[] = [];
            const worker = createWorker({
                ...options(context, queue.queueUrl, async ({ id }) => {
                    if (id !== 'a-1') {
                        return;
                    }
                    started.resolve();
                    await finish.promise;
                }),
                // Records which job each visibility change is for, as it's made
                sqs: {
                    receiveMessage: async (input, requestOptions) => {
                        const output = await sqs.receiveMessage(input, requestOptions);
                        const { Messages: messages = [] } = output;
                        for (const message of messages) {
                            const { id } = JSON.parse(message.Body!) as { readonly id: string };
                            jobs.set(message.ReceiptHandle!, id);
                        }
                        return output;
                    },
                    deleteMessage: async input => sqs.deleteMessage(input),
                    changeMessageVisibility: async input => {
                        changes.push({
                            job: jobs.get(input.ReceiptHandle!)!,
                            seconds: input.VisibilityTimeout!,
                        });
                        return sqs.changeMessageVisibility(input);
                    },
                },
            });
            await sendJobs(sqs, queue, groupA);
            const polled = pollJobs(worker);
            await started.promise;
            await clock.tickAsync(10_000);
            finish.resolve();

            expect(await polled).to.deep.equal([
                { jobId: 'a-1', outcome: 'done' },
                { jobId: 'a-2', outcome: 'done' },
            ]);
            // The second job was received with the first, so without its own extension it would be out of flight by
            // the time it ran
            expect(changes).to.deep.equal([
                { job: 'a-1', seconds: 30 },
                { job: 'a-2', seconds: 30 },
            ]);
        });
    });
});

suite('FIFO dead letters', () => {
    const withQueue = withAws.beforeEach(async ({ sqs }) => ({
        queue: await createJobQueue(sqs, {
            name: uniqueName(),
            fifo: true,
            visibilityTimeoutMs: 30_000,
            maxReceiveCount: 2,
        }),
    }));

    withQueue.test(
        'Moves the rest of a group to the dead-letter queue with a job that keeps failing',
        async context => {
            const { sqs, queue } = context;
            let isBroken = true;
            const ran: string[] = [];
            const worker = createWorker(
                options(context, queue.queueUrl, async ({ id }) => {
                    if (isBroken && id === 'a-1') {
                        throw new Error('Bug');
                    }
                    ran.push(id);
                })
            );
            await sendJobs(sqs, queue, groupA);

            // The second job is received with the first each time, so its receive count climbs with the first's
            for (let receive = 0; receive < 2; receive++) {
                expect(await pollJobs(worker)).to.deep.equal([
                    { jobId: 'a-1', outcome: 'failed' },
                    { jobId: null, outcome: 'deferred' },
                ]);
            }
            expect(await pollJobs(worker)).to.deep.equal([]);
            expect(await peek(sqs, queue.deadLetterUrl)).to.deep.equal(
                groupA.map(({ id, type, payload }) => JSON.stringify({ id, type, payload }))
            );
            expect(ran).to.deep.equal([]);

            isBroken = false;
            expect(
                await redriveDeadLetters(sqs, { deadLetterArn: queue.deadLetterArn, pollMs: 10 })
            ).to.equal(2);
            expect(await pollJobs(worker)).to.deep.equal([
                { jobId: 'a-1', outcome: 'done' },
                { jobId: 'a-2', outcome: 'done' },
            ]);
            expect(ran).to.deep.equal(['a-1', 'a-2']);
        }
    );
});
