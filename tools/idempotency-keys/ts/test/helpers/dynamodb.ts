import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { Agent } from 'node:https';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout } from 'node:timers/promises';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { createTableInput } from 'idempotency-keys/dynamodb';
import { before } from 'mocha-chain';

/**
 * Seconds without a request after which the emulator stops on its own, should this process die before stopping it.
 */
const idleTimeoutSeconds = 120;
const tablePollMs = 100;

interface ServerInformation {
    readonly endpoint_url: string;
    readonly config_file: string;
    readonly ca_file: string;
}

/**
 * Starts AWS Emulator on a free port, and reads where it serves from its startup line.
 *
 * @returns The process, and the line's fields
 */
const startEmulator = async (): Promise<{
    readonly emulator: ChildProcess;
    readonly server: ServerInformation;
}> => {
    // Authentication stays on, as on AWS: requests are signed with this run's keys
    const emulator = spawn(
        // eslint-disable-next-line sonarjs/no-os-command-from-path -- From PATH, where the devcontainer and Dagger put it
        'aws-emulator',
        ['-p', '0', '-t', 'off', '--idle-timeout', String(idleTimeoutSeconds)],
        { stdio: ['ignore', 'pipe', 'inherit'] }
    );
    // Settles only with an error. After the startup line, the race below has already handled it
    const stopped = new Promise<never>((_resolve, reject) => {
        emulator.once('error', error => {
            reject(
                new Error(
                    'Could not run aws-emulator, which the DynamoDB tests need on PATH. The devcontainer and the Dagger test container install it: rebuild the devcontainer',
                    { cause: error }
                )
            );
        });
        emulator.once('exit', code => {
            reject(new Error(`aws-emulator exited with ${String(code)} before it started`));
        });
    });
    const started = (async () => {
        const lines = createInterface({ input: emulator.stdout });
        for await (const line of lines) {
            let entry: { fields?: Partial<ServerInformation> & { message?: string } };
            try {
                entry = JSON.parse(line) as typeof entry;
            } catch {
                // It also writes a few lines of plain text
                continue;
            }
            if (entry.fields?.message === 'emulator server information') {
                return entry.fields as ServerInformation;
            }
        }
        // Its output ended, so it stopped: say why
        return stopped;
    })();
    const server = await Promise.race([started, stopped]);
    // Keep reading, so its output never fills the pipe
    emulator.stdout.resume();
    return { emulator, server };
};

/**
 * Reads one key of an INI file, written `name = value`.
 *
 * @param ini - The file's text
 * @param name - The key
 * @returns Its value
 */
const iniValue = (ini: string, name: string): string => {
    const pattern = new RegExp(String.raw`^${name}\s*=\s*(?<value>\S+)$`, 'mv');
    return pattern.exec(ini)!.groups!.value!;
};

/**
 * Connects the SDK to the emulator, trusting only its certificate authority, and signing with its keys.
 *
 * @param server - The startup line's fields
 * @returns The client
 */
const connect = async (server: ServerInformation): Promise<DynamoDB> => {
    const [ca, credentials] = await Promise.all([
        readFile(server.ca_file),
        readFile(path.join(path.dirname(server.config_file), 'emulator_credentials'), 'utf8'),
    ]);
    return new DynamoDB({
        endpoint: server.endpoint_url,
        region: 'us-east-1',
        credentials: {
            accessKeyId: iniValue(credentials, 'aws_access_key_id'),
            secretAccessKey: iniValue(credentials, 'aws_secret_access_key'),
        },
        requestHandler: { httpsAgent: new Agent({ ca }) },
    });
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
    const { emulator, server } = await startEmulator();
    const dynamodb = await connect(server);
    const tableName = `idempotency_keys_${randomUUID()}`;
    // As on AWS, a new table takes a few seconds to be ready
    await createTable(dynamodb, tableName);
    shared.context = { dynamodb, tableName };
    return { emulator, ...shared.context };
});
withDynamoDb.after(async ({ emulator, dynamodb, tableName }) => {
    await dynamodb.deleteTable({ TableName: tableName });
    dynamodb.destroy();
    const exited = once(emulator, 'exit');
    emulator.kill('SIGTERM');
    await exited;
});

/**
 * The same as {@link withDynamoDb}'s context, for a hook chained from another fixture.
 *
 * @returns The client and table
 */
export const dynamoDb = (): DynamoDbContext => shared.context!;
