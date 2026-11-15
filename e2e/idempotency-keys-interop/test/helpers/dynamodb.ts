import type { Context } from 'mocha';
import type { AwsEmulator } from 'aws-emulator-launch';
import { randomUUID } from 'node:crypto';
import { Agent } from 'node:https';
import { setTimeout } from 'node:timers/promises';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { AwsEmulatorSpawnError, launchAwsEmulator } from 'aws-emulator-launch';
import { createTableInput } from 'idempotency-keys/dynamodb';
import { withDolly } from '#test/helpers/database.js';

const tablePollMs = 100;

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
        if (error instanceof AwsEmulatorSpawnError) {
            throw new Error(
                'The DynamoDB cases need aws-emulator on PATH. The devcontainer and the Dagger test container install it: rebuild the devcontainer',
                { cause: error }
            );
        }
        throw error;
    }
};

/**
 * Creates a table, and waits until it can be used.
 *
 * @param dynamodb - The client
 * @param tableName - What to call it
 */
const createTable = async (dynamodb: DynamoDB, tableName: string): Promise<void> => {
    await dynamodb.createTable(createTableInput(tableName));
    for (;;) {
        const { Table: table } = await dynamodb.describeTable({ TableName: tableName });
        if (table?.TableStatus === 'ACTIVE') {
            return;
        }
        await setTimeout(tablePollMs);
    }
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
    const client = new DynamoDB({
        endpoint: emulator.endpoint,
        region: emulator.region,
        credentials: emulator.credentials,
        requestHandler: { httpsAgent: new Agent({ ca: emulator.ca }) },
    });
    await createTable(client, dynamoDbConfig.table);
    return { emulator, client, dynamoDb: dynamoDbConfig };
});
withDynamoDb.after(async ({ emulator, client }) => {
    client.destroy();
    await emulator.stop();
});
