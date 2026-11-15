// The only file that starts AWS Emulator or builds an SDK client: the launcher's API is still settling, so a change
// to it lands here alone.
import type { AwsEmulator } from 'aws-emulator-launch';
import { randomUUID } from 'node:crypto';
import { Agent } from 'node:https';
import { EventBridge } from '@aws-sdk/client-eventbridge';
import { SQS } from '@aws-sdk/client-sqs';
import { AwsEmulatorSpawnError, launchAwsEmulator } from 'aws-emulator-launch';
import { before } from 'mocha-chain';

/**
 * Starts AWS Emulator on a free port, which the devcontainer and Dagger's test container install.
 *
 * @returns The running emulator
 * @rejects {Error} When it can't start, saying to rebuild the devcontainer when it isn't installed
 */
const startEmulator = async (): Promise<AwsEmulator> => {
    try {
        return await launchAwsEmulator();
    } catch (error) {
        if (error instanceof AwsEmulatorSpawnError) {
            throw new Error(
                'The outbox relay tests need aws-emulator on PATH. The devcontainer and the Dagger test container install it: rebuild the devcontainer',
                { cause: error }
            );
        }
        throw error;
    }
};

/**
 * Client settings for the emulator alone: nothing from the environment or `~/.aws` (the default chain), requests
 * signed with this run's keys, and HTTPS trusting only its CA.
 *
 * @param emulator - Running emulator
 * @returns Settings for any SDK client
 */
const clientConfig = (emulator: AwsEmulator) =>
    ({
        endpoint: emulator.endpoint,
        region: emulator.region,
        credentials: emulator.credentials,
        requestHandler: { httpsAgent: new Agent({ ca: emulator.ca }) },
        useFipsEndpoint: false,
        useDualstackEndpoint: false,
    }) as const;

export interface AwsClients {
    readonly eventBridge: EventBridge;
    readonly sqs: SQS;
}

const shared: { clients?: AwsClients } = {};

/**
 * Starts the emulator once per process: at the top level of a module, a hook is a root hook. It keeps everything in
 * memory, so it starts empty.
 */
const withEmulator = before(async () => {
    const emulator = await startEmulator();
    const config = clientConfig(emulator);
    shared.clients = { eventBridge: new EventBridge(config), sqs: new SQS(config) };
    return { emulator };
});
withEmulator.after(async ({ emulator }) => {
    shared.clients!.eventBridge.destroy();
    shared.clients!.sqs.destroy();
    await emulator.stop();
});

/**
 * The run's clients, once the root hook has started the emulator.
 *
 * @returns Clients
 */
export const aws = (): AwsClients => shared.clients!;

/**
 * A name no other test uses: tests share the emulator, and never delete what they create.
 *
 * @param prefix - Start of the name, saying what it names
 * @returns The prefix and a UUID
 */
const uniqueName = (prefix: string): string => `${prefix}-${randomUUID()}`;

/**
 * Creates an event bus of its own for a test.
 *
 * @returns Its name
 */
export const createBus = async (): Promise<string> => {
    const busName = uniqueName('orders');
    await aws().eventBridge.createEventBus({ Name: busName });
    return busName;
};

/**
 * Creates a queue and a rule sending it every `shop.orders` event on the bus. With `policy`, the queue allows
 * EventBridge to send from that rule alone, as AWS requires; without it, EventBridge drops the events and reports no
 * failure: https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-use-resource-based.html#eb-sqs-permissions.
 *
 * @param options - Bus, whether to add the policy, and whether the queue is FIFO
 * @returns The queue's URL
 */
export const subscribeQueue = async ({
    busName,
    policy = true,
    fifo = false,
}: {
    readonly busName: string;
    readonly policy?: boolean;
    readonly fifo?: boolean;
}): Promise<string> => {
    const { eventBridge, sqs } = aws();
    const name = uniqueName('outbox');
    const { QueueUrl: queueUrl } = await sqs.createQueue(
        fifo
            ? {
                  QueueName: `${name}.fifo`,
                  Attributes: { FifoQueue: 'true', ContentBasedDeduplication: 'true' },
              }
            : { QueueName: name }
    );
    const { Attributes: attributes } = await sqs.getQueueAttributes({
        QueueUrl: queueUrl,
        AttributeNames: ['QueueArn'],
    });
    const queueArn = attributes!.QueueArn!;
    const { RuleArn: ruleArn } = await eventBridge.putRule({
        Name: name,
        EventBusName: busName,
        EventPattern: JSON.stringify({ source: ['shop.orders'] }),
    });
    if (policy) {
        await sqs.setQueueAttributes({
            QueueUrl: queueUrl,
            Attributes: {
                Policy: JSON.stringify({
                    Version: '2012-10-17',
                    Statement: [
                        {
                            Effect: 'Allow',
                            Principal: { Service: 'events.amazonaws.com' },
                            Action: 'sqs:SendMessage',
                            Resource: queueArn,
                            Condition: { ArnEquals: { 'aws:SourceArn': ruleArn } },
                        },
                    ],
                }),
            },
        });
    }
    await eventBridge.putTargets({
        Rule: name,
        EventBusName: busName,
        Targets: [
            {
                Id: 'queue',
                Arn: queueArn,
                ...(fifo && { SqsParameters: { MessageGroupId: 'orders' } }),
            },
        ],
    });
    return queueUrl!;
};

/**
 * The parts of EventBridge's envelope the tests read.
 */
export interface DeliveredEvent {
    readonly id: string;
    readonly source: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention -- EventBridge's envelope names it so
    readonly 'detail-type': string;
    readonly detail: Readonly<Record<string, unknown>> & { readonly outboxId: string };
}

/**
 * Receives events from a queue until `count` have arrived, long polling so none is waited for longer than needed.
 * Messages are left on the queue, but stay invisible for the rest of the test.
 *
 * @param queueUrl - Queue to read
 * @param count - How many to wait for
 * @returns Events, in the order received
 */
export const receiveEvents = async (queueUrl: string, count: number): Promise<DeliveredEvent[]> => {
    const events: DeliveredEvent[] = [];
    while (events.length < count) {
        const { Messages: messages = [] } = await aws().sqs.receiveMessage({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: 5,
            VisibilityTimeout: 300,
        });
        events.push(...messages.map(({ Body: body }) => JSON.parse(body!) as DeliveredEvent));
    }
    return events;
};

/**
 * How many messages a queue holds, visible or not.
 *
 * @param queueUrl - Queue to count
 * @returns Messages on it
 */
export const queueDepth = async (queueUrl: string): Promise<number> => {
    const { Attributes: attributes } = await aws().sqs.getQueueAttributes({
        QueueUrl: queueUrl,
        AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible'],
    });
    return (
        Number(attributes!.ApproximateNumberOfMessages) +
        Number(attributes!.ApproximateNumberOfMessagesNotVisible)
    );
};
