import type { AwsEmulator } from 'aws-emulator-launch';
import type { IdempotencyKeysOptions } from 'idempotency-keys';
import { randomUUID } from 'node:crypto';
import { Agent } from 'node:https';
import { DynamoDB, waitUntilTableExists } from '@aws-sdk/client-dynamodb';
import { SQS } from '@aws-sdk/client-sqs';
import { AwsEmulatorSpawnError, launchAwsEmulator } from 'aws-emulator-launch';
import { IdempotencyKeys } from 'idempotency-keys';
import { createTableInput, DynamoDbStore } from 'idempotency-keys/dynamodb';
import { before } from 'mocha-chain';

// Every call to aws-emulator-launch and every SDK client is built here, so a change to either touches one file

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
                'The tests need aws-emulator on PATH. The devcontainer and the Dagger test container install it: rebuild the devcontainer',
                { cause: error }
            );
        }
        throw error;
    }
};

/**
 * What every client takes to reach the emulator, and nothing from the environment: the endpoint, region and this
 * run's keys, a handler trusting only the emulator's certificate authority, and no FIPS or dual-stack endpoints.
 *
 * @param emulator - The running emulator
 * @returns The client configuration
 */
const clientConfig = (emulator: AwsEmulator) => ({
    endpoint: emulator.endpoint,
    region: emulator.region,
    credentials: emulator.credentials,
    requestHandler: { httpsAgent: new Agent({ ca: emulator.ca }) },
    useFipsEndpoint: false,
    useDualstackEndpoint: false,
});

/**
 * How long to wait for a new table to be ready, in seconds.
 */
const tableWaitSeconds = 30;

interface AwsContext {
    readonly sqs: SQS;
    readonly dynamodb: DynamoDB;
    readonly table: string;
}

const shared: { context?: AwsContext } = {};

/**
 * The emulator's clients and the run's table. At the top level of a module, a hook applies to every test: a root
 * hook, run once per process. The emulator keeps everything in memory, so it starts empty; tests share the table,
 * each on event ids of its own, and create queues of their own.
 */
const withAws = before(async () => {
    const emulator = await startEmulator();
    const config = clientConfig(emulator);
    const sqs = new SQS(config);
    const dynamodb = new DynamoDB(config);
    const table = `webhook_receiver_${randomUUID()}`;
    await dynamodb.createTable(createTableInput(table));
    // As on AWS, a new table takes a few seconds to be ready
    await waitUntilTableExists(
        { client: dynamodb, maxWaitTime: tableWaitSeconds },
        { TableName: table }
    );
    shared.context = { sqs, dynamodb, table };
    return { emulator, sqs, dynamodb };
});
withAws.after(async ({ emulator, sqs, dynamodb }) => {
    sqs.destroy();
    dynamodb.destroy();
    await emulator.stop();
});

/**
 * The SQS client.
 *
 * @returns The client
 */
export const sqs = (): SQS => shared.context!.sqs;

/**
 * Creates a queue with a unique name.
 *
 * @returns Its URL
 */
export const createQueue = async (): Promise<string> => {
    const { QueueUrl: queueUrl } = await sqs().createQueue({
        QueueName: `webhook-receiver-${randomUUID()}`,
    });
    return queueUrl!;
};

/**
 * Idempotency keys on the run's DynamoDB table.
 *
 * @param options - Durations, as the receiver's README sets them unless given
 * @returns The idempotency keys
 */
export const dynamoDbKeys = (
    options: Omit<IdempotencyKeysOptions, 'store'> = {}
): IdempotencyKeys => {
    const { dynamodb, table } = shared.context!;
    return new IdempotencyKeys({
        store: new DynamoDbStore({ connection: dynamodb, tableName: table }),
        ttlMs: 7 * 24 * 60 * 60 * 1000,
        leaseMs: 10_000,
        ...options,
    });
};
