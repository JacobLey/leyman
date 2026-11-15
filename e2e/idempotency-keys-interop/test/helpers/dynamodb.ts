import type { Context } from 'mocha';
import type { AwsEmulator } from 'aws-emulator-launch';
import { randomUUID } from 'node:crypto';
import { DynamoDB, waitUntilTableExists } from '@aws-sdk/client-dynamodb';
import { awsClientConfig, AwsEmulatorNotRunError, launchAwsEmulator } from 'aws-emulator-launch';
import { createTableInput } from 'idempotency-keys/dynamodb';
import { withDolly } from '#test/helpers/database.js';

/**
 * How the SDK's waiter polls a new table, in seconds: often, as the emulator makes one active within seconds (the
 * waiter's own minimum delay is 20 s), and only so long, so a table that never becomes active fails the run.
 */
const tableWaiter = { minDelay: 0.1, maxDelay: 0.5, maxWaitTime: 30 };

/**
 * Where both servers reach the emulator, and the run's table.
 */
export interface DynamoDbConfig {
    readonly endpoint: string;
    readonly caFile: string;
    readonly region: string;
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly table: string;
}

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
        if (error instanceof AwsEmulatorNotRunError) {
            throw new Error(
                'The DynamoDB cases need aws-emulator on PATH. The devcontainer and the Dagger test container install it: rebuild the devcontainer',
                { cause: error }
            );
        }
        throw error;
    }
};

/**
 * Creates a table, and waits until it is active. Time to Live stays off, as the store never relies on it.
 *
 * @param dynamodb - The client
 * @param table - What to call it
 */
const createTable = async (dynamodb: DynamoDB, table: string): Promise<void> => {
    await dynamodb.createTable(createTableInput(table));
    await waitUntilTableExists({ client: dynamodb, ...tableWaiter }, { TableName: table });
};

/**
 * One emulator and one table for the run, which every DynamoDB case shares: a table takes a few seconds to be ready,
 * as on AWS, and each test already claims keys of its own (a new scope and key). Chained from the database's hook,
 * at the top level of a module, so a root hook too, run once per process.
 */
export const withDynamoDb = withDolly.before(async function (this: Context) {
    this.timeout(60_000);
    const emulator = await startEmulator();
    const dynamoDbConfig: DynamoDbConfig = {
        endpoint: emulator.endpoint,
        caFile: emulator.caFile,
        region: emulator.region,
        accessKeyId: emulator.credentials.accessKeyId,
        secretAccessKey: emulator.credentials.secretAccessKey,
        table: `idempotency_keys_${randomUUID()}`,
    };
    // Authentication stays on, as on AWS: requests are signed with this run's keys
    const client = new DynamoDB(awsClientConfig(emulator));
    await createTable(client, dynamoDbConfig.table);
    return { emulator, client, dynamoDb: dynamoDbConfig };
});
withDynamoDb.after(async ({ emulator, client }) => {
    client.destroy();
    await emulator.stop();
});
