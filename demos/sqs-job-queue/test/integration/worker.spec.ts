import type {
    Job,
    JobHandler,
    ReceivedJob,
    WorkerOptions,
    WorkerSqs,
} from '@leyman/demo-sqs-job-queue';
import type { IdempotencyStore, RenewParams } from 'idempotency-keys';
import type { AwsContext } from '#test/helpers/aws.js';
import pDefer from 'p-defer';
import sinon from 'sinon';
import {
    createJobQueue,
    createWorker,
    defaultRetryDelayMs,
    JobLeaseLostError,
    sendJobs,
    WorkerOptionError,
} from '@leyman/demo-sqs-job-queue';
import { expect } from '@leyman/expect';
import { suite, test } from 'mocha-chain';
import { createStore, uniqueName, withAws } from '#test/helpers/aws.js';
import { peek, pollJobs, pollOutcomes, watchDeletes } from '#test/helpers/queue.js';

const job: Job = { id: 'job-1', type: 'email', payload: { to: 'a@example.com' } };

/**
 * A handler that records each job it's given, then runs `run`.
 *
 * @param run - What each call does, given its job, signal and number from 1
 * @returns The handler and the jobs it was given
 */
const recorder = (
    run: (
        received: ReceivedJob,
        signal: AbortSignal,
        call: number
    ) => Promise<void> = async () => {}
): { readonly handle: JobHandler; readonly calls: ReceivedJob[] } => {
    const calls: ReceivedJob[] = [];
    return {
        calls,
        handle: async (received, signal) => {
            calls.push(received);
            await run(received, signal, calls.length);
        },
    };
};

/**
 * A handler that runs until its signal aborts, then rejects with the reason.
 *
 * @param started - Resolved once the handler runs
 * @returns The handler
 */
const untilAborted =
    (started: { readonly resolve: () => void }): JobHandler =>
    async (_job, signal) => {
        started.resolve();
        await new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => {
                reject(signal.reason as Error);
            });
        });
    };

/**
 * Worker options for a queue, with short polls (the emulator answers a short poll with every message) and retries
 * delivered at once.
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

/**
 * Wraps the client, to pass every call through but the ones `changeVisibility` handles.
 *
 * @param sqs - Real client
 * @param changeVisibility - Called for each `ChangeMessageVisibility`, with the real call
 * @returns The seam
 */
const wrap = (
    sqs: WorkerSqs,
    changeVisibility: WorkerSqs['changeMessageVisibility']
): WorkerSqs => ({
    receiveMessage: async (input, requestOptions) => sqs.receiveMessage(input, requestOptions),
    deleteMessage: async input => sqs.deleteMessage(input),
    changeMessageVisibility: changeVisibility,
});

/**
 * Wraps the store, to pass every call through but `renew`.
 *
 * @param store - Real store
 * @param renew - Called for each renewal, or `undefined` for a store without `renew`
 * @returns The seam
 */
const withRenew = (
    store: IdempotencyStore,
    renew: ((params: RenewParams) => Promise<boolean>) | undefined
): IdempotencyStore => ({
    claim: async params => store.claim(params),
    complete: async (identity, token, response) => store.complete(identity, token, response),
    release: async (identity, token) => store.release(identity, token),
    ...(renew && { renew }),
});

suite('Worker', () => {
    test('Doubles the default retry delay from 1 second, up to 15 minutes', () => {
        expect([1, 2, 3, 11, 20].map(count => defaultRetryDelayMs(count))).to.deep.equal([
            1000, 2000, 4000, 900_000, 900_000,
        ]);
    });

    const withQueue = withAws.beforeEach(async ({ sqs }) => ({
        queue: await createJobQueue(sqs, {
            name: uniqueName(),
            visibilityTimeoutMs: 30_000,
            maxReceiveCount: 5,
        }),
    }));

    withQueue.test("Refuses a leaseMs that a heartbeat can't renew in time", async context => {
        const { queue } = context;
        expect(() =>
            createWorker({
                ...options(context, queue.queueUrl, recorder().handle),
                // The heartbeat runs every 10 seconds
                leaseMs: 10_000,
            })
        )
            .to.throw(WorkerOptionError)
            .with.property('option', 'leaseMs');
    });

    withQueue.test('Refuses a store without renew', async context => {
        const { queue } = context;
        expect(() =>
            createWorker({
                ...options(context, queue.queueUrl, recorder().handle),
                store: withRenew(createStore(context), undefined),
            })
        )
            .to.throw(WorkerOptionError)
            .with.property('option', 'store');
    });

    withQueue.test('Runs a job, then deletes it', async context => {
        const { sqs, queue } = context;
        const { handle, calls } = recorder();
        const watched = watchDeletes(sqs);
        const worker = createWorker({
            ...options(context, queue.queueUrl, handle),
            sqs: watched.sqs,
        });
        await sendJobs(sqs, queue, [job]);

        expect(await pollJobs(worker)).to.deep.equal([{ jobId: 'job-1', outcome: 'done' }]);
        expect(calls).to.deep.equal([
            { id: 'job-1', type: 'email', payload: { to: 'a@example.com' }, receiveCount: 1 },
        ]);
        expect(watched.undeleted()).to.deep.equal([]);
    });

    withQueue.test('Runs a job without a payload', async context => {
        const { sqs, queue } = context;
        const { handle, calls } = recorder();
        await sqs.sendMessage({
            QueueUrl: queue.queueUrl,
            MessageBody: JSON.stringify({ id: 'bare', type: 'ping' }),
        });

        expect(
            await pollOutcomes(createWorker(options(context, queue.queueUrl, handle)))
        ).to.deep.equal(['done']);
        expect(calls).to.deep.equal([
            { id: 'bare', type: 'ping', payload: undefined, receiveCount: 1 },
        ]);
    });

    withQueue.test('Delivers a failed job again after its retry delay', async context => {
        const { sqs, queue } = context;
        const failure = new Error('SMTP is down');
        const { handle, calls } = recorder(async (_received, _signal, call) => {
            if (call === 1) {
                throw failure;
            }
        });
        const worker = createWorker(options(context, queue.queueUrl, handle));
        await sendJobs(sqs, queue, [job]);

        const [failed] = await worker.poll();
        expect(failed).to.deep.equal({
            messageId: failed!.messageId,
            jobId: 'job-1',
            outcome: 'failed',
            error: failure,
        });
        // Released, so the next delivery runs it rather than finding it running
        expect(await pollOutcomes(worker)).to.deep.equal(['done']);
        expect(calls.map(({ receiveCount }) => receiveCount)).to.deep.equal([1, 2]);
    });

    withQueue.test('Hides a failed job for the default retry delay', async context => {
        const { sqs, queue } = context;
        const failing = recorder(async () => {
            throw new Error('Failed');
        });
        const watched = watchDeletes(sqs);
        const worker = createWorker({
            ...options(context, queue.queueUrl, failing.handle),
            sqs: watched.sqs,
            retryDelayMs: defaultRetryDelayMs,
        });
        await sendJobs(sqs, queue, [job]);

        expect(await pollOutcomes(worker)).to.deep.equal(['failed']);
        // 1 second, far longer than the next receive takes
        expect(await pollOutcomes(worker)).to.deep.equal([]);
        expect(watched.undeleted()).to.deep.equal([JSON.stringify(job)]);
    });

    withQueue.test(
        'Deletes a delivery of a job that already ran, without running it',
        async context => {
            const { sqs, queue } = context;
            const { handle, calls } = recorder();
            const watched = watchDeletes(sqs);
            const worker = createWorker({
                ...options(context, queue.queueUrl, handle),
                sqs: watched.sqs,
            });

            await sendJobs(sqs, queue, [job]);
            expect(await pollOutcomes(worker)).to.deep.equal(['done']);
            // The producer sends it again, say after a timeout: a new message on a standard queue
            await sendJobs(sqs, queue, [job]);
            expect(await pollOutcomes(worker)).to.deep.equal(['duplicate']);

            expect(calls).to.have.length(1);
            expect(watched.undeleted()).to.deep.equal([]);
        }
    );

    withQueue.test('Leaves a delivery of a running job for later', async context => {
        const { sqs, queue } = context;
        const started = pDefer();
        const finish = pDefer();
        const first = recorder(async () => {
            started.resolve();
            await finish.promise;
        });
        const second = recorder();
        const workerA = createWorker({
            ...options(context, queue.queueUrl, first.handle),
            maxMessages: 1,
        });
        const workerB = createWorker(options(context, queue.queueUrl, second.handle));

        await sendJobs(sqs, queue, [job]);
        const polledA = pollOutcomes(workerA);
        await started.promise;
        await sendJobs(sqs, queue, [job]);

        expect(await pollOutcomes(workerB)).to.deep.equal(['busy']);
        finish.resolve();
        expect(await polledA).to.deep.equal(['done']);
        expect(await pollOutcomes(workerB)).to.deep.equal(['duplicate']);
        expect(first.calls).to.have.length(1);
        expect(second.calls).to.deep.equal([]);
    });

    withQueue.test('Leaves a job whose id ran with another payload', async context => {
        const { sqs, queue } = context;
        const { handle, calls } = recorder();
        const worker = createWorker(options(context, queue.queueUrl, handle));

        await sendJobs(sqs, queue, [job]);
        await worker.poll();
        await sendJobs(sqs, queue, [{ ...job, payload: { to: 'b@example.com' } }]);

        expect(await pollJobs(worker)).to.deep.equal([{ jobId: 'job-1', outcome: 'reused' }]);
        expect(calls).to.have.length(1);
    });

    withQueue.test("Leaves messages that aren't jobs", async context => {
        const { sqs, queue } = context;
        const { handle, calls } = recorder();
        for (const body of ['not json', 'null', '{"id":"","type":"email"}']) {
            await sqs.sendMessage({ QueueUrl: queue.queueUrl, MessageBody: body });
        }
        const watched = watchDeletes(sqs);
        const worker = createWorker({
            ...options(context, queue.queueUrl, handle),
            sqs: watched.sqs,
            retryDelayMs: () => 30_000,
        });

        expect(await pollJobs(worker)).to.deep.equal([
            { jobId: null, outcome: 'invalid' },
            { jobId: null, outcome: 'invalid' },
            { jobId: null, outcome: 'invalid' },
        ]);
        expect(calls).to.deep.equal([]);
        // Hidden for the retry delay, not deleted
        expect(await peek(sqs, queue.queueUrl)).to.deep.equal([]);
        expect(watched.undeleted()).to.deep.equal(['not json', 'null', '{"id":"","type":"email"}']);
    });

    withQueue.test('Passes on a failed receive', async context => {
        const { queue } = context;
        const worker = createWorker(
            options(context, `${queue.queueUrl}-missing`, recorder().handle)
        );

        await expect(worker.poll()).to.be.rejected.and.eventually.have.property(
            'name',
            'QueueDoesNotExist'
        );
    });

    suite('Heartbeat', () => {
        // Only the heartbeat's interval is faked: the SDK's own timers and clock stay real
        const withClock = withAws.beforeEach(() => ({
            clock: sinon.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }),
        }));
        withClock.afterEach(({ clock }) => {
            clock.restore();
        });

        // A queue whose messages show again at once, so only the heartbeat hides a running job
        const withInstantQueue = withClock.beforeEach(async ({ sqs }) => ({
            queue: await createJobQueue(sqs, {
                name: uniqueName(),
                visibilityTimeoutMs: 0,
                maxReceiveCount: 5,
            }),
        }));

        /**
         * The client, recording each visibility change once it's made.
         *
         * @param sqs - Real client
         * @returns The seam, and the visibility timeouts set so far
         */
        const watchVisibility = (
            sqs: WorkerSqs
        ): { readonly sqs: WorkerSqs; readonly changes: number[] } => {
            const changes: number[] = [];
            return {
                changes,
                sqs: wrap(sqs, async input => {
                    const output = await sqs.changeMessageVisibility(input);
                    changes.push(input.VisibilityTimeout!);
                    return output;
                }),
            };
        };

        withInstantQueue.test('Hides a running job from other workers', async context => {
            const { sqs, queue, clock } = context;
            const started = pDefer();
            const finish = pDefer();
            const extended = pDefer();
            const worker = createWorker({
                ...options(context, queue.queueUrl, async () => {
                    started.resolve();
                    await finish.promise;
                }),
                sqs: wrap(sqs, async input => {
                    const output = await sqs.changeMessageVisibility(input);
                    extended.resolve();
                    return output;
                }),
            });
            await sendJobs(sqs, queue, [job]);
            const polled = pollOutcomes(worker);
            await started.promise;
            // Not peeked at before the heartbeat: a receive then would give the message a new receipt handle, which on
            // AWS supersedes the worker's
            await clock.tickAsync(10_000);
            await extended.promise;
            expect(await peek(sqs, queue.queueUrl)).to.deep.equal([]);

            finish.resolve();
            expect(await polled).to.deep.equal(['done']);
        });

        withInstantQueue.test(
            'Renews the lease at each heartbeat, so a job may outrun it',
            async context => {
                const { sqs, queue, clock } = context;
                const store = createStore(context);
                const renewals: boolean[] = [];
                // Resolved as each heartbeat's renewal is made
                const renewedAt = [pDefer(), pDefer(), pDefer()];
                const started = pDefer();
                const finish = pDefer();
                const worker = createWorker({
                    ...options(context, queue.queueUrl, async () => {
                        started.resolve();
                        await finish.promise;
                    }),
                    // Records each renewal of the real store once it's made
                    store: withRenew(store, async params => {
                        const isRenewed = await store.renew!(params);
                        renewals.push(isRenewed);
                        renewedAt[renewals.length - 1]!.resolve();
                        return isRenewed;
                    }),
                    leaseMs: 15_000,
                });
                await sendJobs(sqs, queue, [job]);
                const polled = pollOutcomes(worker);
                await started.promise;
                // Three heartbeats, so the job runs twice as long as its lease
                for (const renewed of renewedAt) {
                    await clock.tickAsync(10_000);
                    await renewed.promise;
                }
                finish.resolve();

                expect(await polled).to.deep.equal(['done']);
                expect(renewals).to.deep.equal([true, true, true]);
            }
        );

        withInstantQueue.test('Stops a job whose lease was taken over', async context => {
            const { sqs, queue, clock } = context;
            const started = pDefer();
            const watched = watchVisibility(sqs);
            const worker = createWorker({
                ...options(context, queue.queueUrl, untilAborted(started)),
                sqs: watched.sqs,
                // A fake: the record no longer holds the job's token, as after another delivery took it over
                store: withRenew(createStore(context), async () => false),
            });
            await sendJobs(sqs, queue, [job]);
            const polled = worker.poll();
            await started.promise;
            await clock.tickAsync(10_000);

            const [result] = await polled;
            expect(result!.outcome).to.equal('failed');
            expect(result!.error).to.be.an.instanceOf(JobLeaseLostError);
            expect(result!.error).to.have.property('jobId', job.id);
            // The heartbeat's extension, and the retry delay once the job stopped, which may finish first
            expect(watched.changes).to.have.members([30, 0]);
        });

        withInstantQueue.test("Stops a job whose lease can't be renewed", async context => {
            const { sqs, queue, clock } = context;
            const unreachable = new Error('Store is down');
            const started = pDefer();
            const worker = createWorker({
                ...options(context, queue.queueUrl, untilAborted(started)),
                // A fake: the renewal fails, as it would if the store were unreachable
                store: withRenew(createStore(context), async () => {
                    throw unreachable;
                }),
            });
            await sendJobs(sqs, queue, [job]);
            const polled = worker.poll();
            await started.promise;
            await clock.tickAsync(10_000);

            const [result] = await polled;
            expect(result!.outcome).to.equal('failed');
            expect(result!.error).to.equal(unreachable);
        });

        withInstantQueue.test("Stops a job whose visibility can't be extended", async context => {
            const { sqs, queue, clock } = context;
            const refused = new Error('Refused');
            const started = pDefer();
            const finish = pDefer();
            const reasons: unknown[] = [];
            let heartbeats = 0;
            const worker = createWorker({
                // A handler that doesn't stop when told: the heartbeat still stops extending
                ...options(context, queue.queueUrl, async (_received, signal) => {
                    started.resolve();
                    await finish.promise;
                    reasons.push(signal.reason);
                }),
                // A fake: the heartbeat's call fails, as it would if SQS were unreachable
                sqs: wrap(sqs, async () => {
                    heartbeats++;
                    throw refused;
                }),
            });
            await sendJobs(sqs, queue, [job]);
            const polled = pollOutcomes(worker);
            await started.promise;
            await clock.tickAsync(10_000);
            await clock.tickAsync(10_000);
            finish.resolve();

            expect(await polled).to.deep.equal(['done']);
            expect(heartbeats).to.equal(1);
            expect(reasons).to.deep.equal([refused]);
        });
    });

    suite('run', () => {
        withQueue.test('Lets running jobs finish when stopped', async context => {
            const { sqs, queue } = context;
            const controller = new AbortController();
            const started = pDefer();
            const finish = pDefer();
            const { handle, calls } = recorder(async () => {
                started.resolve();
                await finish.promise;
            });
            const watched = watchDeletes(sqs);
            const worker = createWorker({
                ...options(context, queue.queueUrl, handle),
                sqs: watched.sqs,
                waitTimeMs: 20_000,
            });
            await sendJobs(sqs, queue, [job]);

            const running = worker.run(controller.signal);
            await started.promise;
            controller.abort();
            finish.resolve();
            await running;

            expect(calls).to.have.length(1);
            expect(watched.undeleted()).to.deep.equal([]);
        });

        withQueue.test('Stops a receive that is waiting', async context => {
            const { queue } = context;
            const controller = new AbortController();
            const worker = createWorker({
                ...options(context, queue.queueUrl, recorder().handle),
                waitTimeMs: 20_000,
            });

            const running = worker.run(controller.signal);
            controller.abort();
            await expect(running).to.eventually.equal(undefined);
        });
    });
});
