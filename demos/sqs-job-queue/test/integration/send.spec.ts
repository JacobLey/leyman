import type { Job, SendJobsSqs } from '@leyman/demo-sqs-job-queue';
import {
    createJobQueue,
    MissingGroupError,
    sendJobs,
    SendJobsError,
} from '@leyman/demo-sqs-job-queue';
import { expect } from '@leyman/expect';
import { suite } from 'mocha-chain';
import { uniqueName, withAws } from '#test/helpers/aws.js';
import { drain } from '#test/helpers/queue.js';

const job = (id: string): Job => ({ id, type: 'email', payload: { to: `${id}@example.com` } });

suite('sendJobs', () => {
    const withQueue = withAws.beforeEach(async ({ sqs }) => ({
        queue: await createJobQueue(sqs, {
            name: uniqueName(),
            visibilityTimeoutMs: 30_000,
            maxReceiveCount: 3,
        }),
    }));

    withQueue.test('Sends jobs in batches of 10', async ({ sqs, queue }) => {
        const ids = Array.from({ length: 25 }, (_, i) => `job-${String(i).padStart(2, '0')}`);
        const batches: number[] = [];
        await sendJobs(
            {
                sendMessageBatch: async input => {
                    batches.push(input.Entries!.length);
                    return sqs.sendMessageBatch(input);
                },
            },
            { queueUrl: queue.queueUrl },
            ids.map(id => job(id))
        );

        expect(batches).to.deep.equal([10, 10, 5]);
        const bodies = await drain(sqs, queue.queueUrl);
        const received = bodies.map(body => (JSON.parse(body) as Job).id);
        expect(received.toSorted((a, b) => a.localeCompare(b))).to.deep.equal(ids);
    });

    withQueue.test('Fails a job SQS refuses, after sending the rest', async ({ sqs, queue }) => {
        // SQS allows only some Unicode characters in a body, and refuses others (here U+FFFF, which JSON leaves as
        // is) as the sender's fault:
        // https://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_SendMessage.html
        await expect(
            sendJobs(sqs, queue, [job('good'), { id: 'bad', type: 'email', payload: '￿' }])
        )
            .to.be.rejectedWith(SendJobsError)
            .and.eventually.have.property('failed')
            .that.deep.equals([
                { jobId: 'bad', code: 'InvalidMessageContents', senderFault: true },
            ]);
        expect(await drain(sqs, queue.queueUrl)).to.have.length(1);
    });

    withQueue.test(
        'Sends again a job SQS failed through no fault of the sender',
        async ({ sqs, queue }) => {
            // A fake: the emulator never fails a message on its side, as SQS does when it has an internal error
            let calls = 0;
            const flaky: SendJobsSqs = {
                sendMessageBatch: async input => {
                    calls++;
                    if (calls > 1) {
                        return sqs.sendMessageBatch(input);
                    }
                    const [first, ...rest] = input.Entries!;
                    const output = await sqs.sendMessageBatch({ ...input, Entries: rest });
                    return {
                        ...output,
                        Failed: [{ Id: first!.Id, Code: 'InternalError', SenderFault: false }],
                    };
                },
            };
            await sendJobs(flaky, queue, [job('a'), job('b')]);

            expect(calls).to.equal(2);
            expect(await drain(sqs, queue.queueUrl)).to.have.length(2);
        }
    );

    withQueue.test('Gives up after maxAttempts', async ({ queue }) => {
        // A fake, as above
        let calls = 0;
        const failing: SendJobsSqs = {
            sendMessageBatch: async input => {
                calls++;
                return {
                    $metadata: {},
                    Successful: [],
                    Failed: input.Entries!.map(({ Id: id }) => ({
                        Id: id,
                        Code: 'InternalError',
                        SenderFault: false,
                    })),
                };
            },
        };

        await expect(sendJobs(failing, { queueUrl: queue.queueUrl, maxAttempts: 2 }, [job('a')]))
            .to.be.rejectedWith(SendJobsError)
            .and.eventually.have.property('failed')
            .that.deep.equals([{ jobId: 'a', code: 'InternalError', senderFault: false }]);
        expect(calls).to.equal(2);
    });

    withAws.test('Requires a group on a FIFO queue, before sending anything', async ({ sqs }) => {
        const queue = await createJobQueue(sqs, {
            name: uniqueName(),
            fifo: true,
            visibilityTimeoutMs: 30_000,
            maxReceiveCount: 3,
        });

        await expect(sendJobs(sqs, queue, [{ ...job('a'), group: 'g' }, job('b')]))
            .to.be.rejectedWith(MissingGroupError)
            .and.eventually.have.property('jobId', 'b');
        expect(await drain(sqs, queue.queueUrl)).to.deep.equal([]);
    });
});
