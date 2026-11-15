import type { AwsEmulator } from 'aws-emulator-launch';
import { randomUUID } from 'node:crypto';
import { Agent } from 'node:https';
import { setTimeout } from 'node:timers/promises';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { AwsEmulatorSpawnError, launchAwsEmulator } from 'aws-emulator-launch';
import { createTableInput } from 'idempotency-keys/dynamodb';
import { before } from 'mocha-chain';

const tablePollMs = 100;

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
                'The DynamoDB tests need aws-emulator on PATH. The devcontainer and the Dagger test container install it: rebuild the devcontainer',
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
export const createTable = async (dynamodb: DynamoDB, tableName: string): Promise<void> => {
    await dynamodb.createTable(createTableInput(tableName));
    for (;;) {
        const { Table: table } = await dynamodb.describeTable({ TableName: tableName });
        if (table?.TableStatus === 'ACTIVE') {
            return;
        }
        await setTimeout(tablePollMs);
    }
};

export interface DynamoDbContext {
    readonly dynamodb: DynamoDB;
    readonly tableName: string;
}

const shared: { context?: DynamoDbContext } = {};

/**
 * The emulator's client and the run's table. At the top level of a module, a hook applies to every test: a root hook,
 * run once per process. The emulator keeps everything in memory, so it starts empty, and tests share the table, each
 * on identities of its own.
 */
export const withDynamoDb = before(async () => {
    const emulator = await startEmulator();
    // Authentication stays on, as on AWS: requests are signed with this run's keys
    const dynamodb = new DynamoDB({
        endpoint: emulator.endpoint,
        region: emulator.region,
        credentials: emulator.credentials,
        requestHandler: { httpsAgent: new Agent({ ca: emulator.ca }) },
    });
    const tableName = `idempotency_keys_${randomUUID()}`;
    // As on AWS, a new table takes a few seconds to be ready
    await createTable(dynamodb, tableName);
    shared.context = { dynamodb, tableName };
    return { emulator, ...shared.context };
});
withDynamoDb.after(async ({ emulator, dynamodb, tableName }) => {
    await dynamodb.deleteTable({ TableName: tableName });
    dynamodb.destroy();
    await emulator.stop();
});

/**
 * The same as {@link withDynamoDb}'s context, for a hook chained from another fixture.
 *
 * @returns The client and table
 */
export const dynamoDb = (): DynamoDbContext => shared.context!;
