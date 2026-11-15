import type { ReceivedJob } from '@leyman/demo-sqs-job-queue';
import { createJobQueue, createWorker, sendJobs } from '@leyman/demo-sqs-job-queue';
import { expect } from '@leyman/expect';
import { suite } from 'mocha-chain';
import { createStore, uniqueName, withAws } from '#test/helpers/aws.js';
import { countMessages, pollJobs } from '#test/helpers/queue.js';

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

        expect(await countMessages(sqs, queue.queueUrl)).to.deep.equal({ visible: 1, inFlight: 0 });
    });
});
