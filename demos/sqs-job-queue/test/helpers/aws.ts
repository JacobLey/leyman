/**
 * Every call to aws-emulator-launch, and every SDK client, is made here: the clients are built from the emulator's
 * values alone, never the default chain, so a developer's `AWS_PROFILE` or FIPS setting can't change a test.
 */
import type { IdempotencyStore } from 'idempotency-keys';
import { randomUUID } from 'node:crypto';
import { Agent } from 'node:https';
import { DynamoDB, waitUntilTableExists } from '@aws-sdk/client-dynamodb';
import { SQS } from '@aws-sdk/client-sqs';
import { AwsEmulatorSpawnError, launchAwsEmulator } from 'aws-emulator-launch';
import { createTableInput, DynamoDbStore } from 'idempotency-keys/dynamodb';
import { before } from 'mocha-chain';

const tableWaitSeconds = 30;

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
        if (error instanceof AwsEmulatorSpawnError) {
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
    const config = {
        endpoint: emulator.endpoint,
        region: emulator.region,
        credentials: emulator.credentials,
        requestHandler: { httpsAgent: new Agent({ ca: emulator.ca }) },
        useFipsEndpoint: false,
        useDualstackEndpoint: false,
    };
    const sqs = new SQS(config);
    const dynamodb = new DynamoDB(config);
    const table = `sqs_job_queue_${randomUUID()}`;
    await dynamodb.createTable(createTableInput(table));
    await waitUntilTableExists(
        { client: dynamodb, maxWaitTime: tableWaitSeconds },
        { TableName: table }
    );
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
    new DynamoDbStore({ connection: dynamodb, tableName: table });

/**
 * A queue name no other test uses.
 *
 * @returns `jobs-` and a random UUID
 */
export const uniqueName = (): string => `jobs-${randomUUID()}`;
