import type { RedriveSqs } from '@leyman/demo-sqs-job-queue';
import {
    createJobQueue,
    createWorker,
    redriveDeadLetters,
    RedriveError,
    sendJobs,
} from '@leyman/demo-sqs-job-queue';
import { expect } from '@leyman/expect';
import { suite } from 'mocha-chain';
import { createStore, uniqueName, withAws } from '#test/helpers/aws.js';
import { peek, pollOutcomes } from '#test/helpers/queue.js';

/**
 * The client, with `ListMessageMoveTasks` answered by a fake: the emulator can't make a move task fail.
 *
 * @param sqs - Real client, which starts the task
 * @param statuses - The task's status at each check, or `null` for no task listed
 * @returns The seam
 */
const fakeTasks = (sqs: RedriveSqs, statuses: readonly (string | null)[]): RedriveSqs => {
    let checks = 0;
    return {
        startMessageMoveTask: async input => sqs.startMessageMoveTask(input),
        listMessageMoveTasks: async () => {
            const status = statuses[checks];
            checks++;
            return {
                $metadata: {},
                Results:
                    status === null
                        ? []
                        : // SQS gives a reason only for a failure
                          [
                              {
                                  Status: status,
                                  ...(status === 'FAILED' && { FailureReason: 'AccessDenied' }),
                              },
                          ],
            };
        },
    };
};

suite('Dead letters', () => {
    const withQueue = withAws.beforeEach(async ({ sqs }) => ({
        queue: await createJobQueue(sqs, {
            name: uniqueName(),
            visibilityTimeoutMs: 30_000,
            maxReceiveCount: 2,
        }),
    }));

    withQueue.test(
        'Moves a job that keeps failing to the dead-letter queue, and back once fixed',
        async context => {
            const { sqs, queue } = context;
            const poison = { id: 'poison', type: 'email', payload: {} };
            let isBroken = true;
            const ran: string[] = [];
            const worker = createWorker({
                sqs,
                queueUrl: queue.queueUrl,
                store: createStore(context),
                handle: async ({ id }) => {
                    if (isBroken) {
                        throw new Error('Bug');
                    }
                    ran.push(id);
                },
                visibilityTimeoutMs: 30_000,
                leaseMs: 60_000,
                retryDelayMs: () => 0,
                waitTimeMs: 0,
            });
            await sendJobs(sqs, queue, [poison]);

            expect(await pollOutcomes(worker)).to.deep.equal(['failed']);
            expect(await pollOutcomes(worker)).to.deep.equal(['failed']);
            // The receive after the last one the queue allows moves it instead
            expect(await pollOutcomes(worker)).to.deep.equal([]);
            expect(await peek(sqs, queue.deadLetterUrl)).to.deep.equal([JSON.stringify(poison)]);

            isBroken = false;
            expect(
                await redriveDeadLetters(sqs, { deadLetterArn: queue.deadLetterArn, pollMs: 10 })
            ).to.equal(1);
            expect(await peek(sqs, queue.deadLetterUrl)).to.deep.equal([]);
            expect(await pollOutcomes(worker)).to.deep.equal(['done']);
            expect(ran).to.deep.equal(['poison']);
        }
    );

    withQueue.test('Rejects when the move task fails', async ({ sqs, queue }) => {
        await expect(
            redriveDeadLetters(fakeTasks(sqs, ['RUNNING', 'FAILED']), {
                deadLetterArn: queue.deadLetterArn,
                pollMs: 1,
            })
        )
            .to.be.rejectedWith(RedriveError, 'Redrive ended FAILED: AccessDenied')
            .and.eventually.have.property('status', 'FAILED');
    });

    withQueue.test('Rejects when the move task is cancelled', async ({ sqs, queue }) => {
        await expect(
            redriveDeadLetters(fakeTasks(sqs, ['CANCELLING', 'CANCELLED']), {
                deadLetterArn: queue.deadLetterArn,
                pollMs: 1,
            })
        ).to.be.rejectedWith(RedriveError, 'Redrive ended CANCELLED: no reason given');
    });

    withQueue.test('Rejects when no move task is listed', async ({ sqs, queue }) => {
        await expect(
            redriveDeadLetters(fakeTasks(sqs, [null]), { deadLetterArn: queue.deadLetterArn })
        )
            .to.be.rejectedWith(RedriveError)
            .and.eventually.have.property('status', 'MISSING');
    });
});
