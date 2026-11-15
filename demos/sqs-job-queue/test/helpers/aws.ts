/**
 * Every call to aws-emulator-launch, and every SDK client, is made here: the clients are built from the emulator's
 * values alone, never the default chain, so a developer's `AWS_PROFILE` or FIPS setting can't change a test.
 */
import type { IdempotencyStore } from 'idempotency-keys';
import { randomUUID } from 'node:crypto';
import { DynamoDB, waitUntilTableExists } from '@aws-sdk/client-dynamodb';
import { SQS } from '@aws-sdk/client-sqs';
import { awsClientConfig, AwsEmulatorNotRunError, launchAwsEmulator } from 'aws-emulator-launch';
import { createTableInput, DynamoDbStore } from 'idempotency-keys/dynamodb';
import { before } from 'mocha-chain';

/**
 * How the SDK's waiter polls a new table, in seconds: often, as the emulator makes one active within seconds (the
 * waiter's own minimum delay is 20 s), and only so long, so a table that never becomes active fails the run.
 */
const tableWaiter = { minDelay: 0.1, maxDelay: 0.5, maxWaitTime: 30 };

/**
 * Starts AWS Emulator, which the devcontainer and Dagger's test container install.
 *
 * @returns The running emulator
 * @rejects {Error} When it can't start, saying to rebuild the devcontainer when it isn't installed
 */
const startEmulator = async (): ReturnType<typeof launchAwsEmulator> => {
    try {
        return await launchAwsEmulator();
    } catch (error) {
        if (error instanceof AwsEmulatorNotRunError) {
            throw new Error(
                'The tests need aws-emulator on PATH. The devcontainer and the Dagger test container install it: rebuild the devcontainer',
                { cause: error }
            );
        }
        throw error;
    }
};

export interface AwsContext {
    readonly sqs: SQS;
    readonly dynamodb: DynamoDB;
    readonly table: string;
}

/**
 * The emulator's clients and the run's table. At the top level of a module, a hook applies to every test: a root hook,
 * run once per process. Tests share the table, each on queues of its own, so job ids never collide.
 */
export const withAws = before(async (): Promise<AwsContext & { stop: () => Promise<void> }> => {
    const emulator = await startEmulator();
    const sqs = new SQS(awsClientConfig(emulator));
    const dynamodb = new DynamoDB(awsClientConfig(emulator));
    const table = `sqs_job_queue_${randomUUID()}`;
    await dynamodb.createTable(createTableInput(table));
    await waitUntilTableExists({ client: dynamodb, ...tableWaiter }, { TableName: table });
    return {
        sqs,
        dynamodb,
        table,
        stop: async () => {
            sqs.destroy();
            dynamodb.destroy();
            await emulator.stop();
        },
    };
});
withAws.after(async ({ stop }) => {
    await stop();
});

/**
 * The store for job ids, on the run's table.
 *
 * @param context - The run's DynamoDB client and table
 * @returns A `DynamoDbStore`
 */
export const createStore = ({ dynamodb, table }: AwsContext): IdempotencyStore =>
    new DynamoDbStore({ connection: dynamodb, table });

/**
 * A queue name no other test uses.
 *
 * @returns `jobs-` and a random UUID
 */
export const uniqueName = (): string => `jobs-${randomUUID()}`;
