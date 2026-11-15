/* eslint-disable @typescript-eslint/naming-convention -- DynamoDB names its request fields in PascalCase, and its attribute types (`B`, `N`, `S`) in capitals */
import type { ClaimParams, ClaimResult, IdempotencyStore, StoredResponse } from './attempt.js';
import { fromHex, toHex } from './encoding.js';

/**
 * An attribute value as the store writes it: bytes, a number written out as text, or a string.
 */
export type DynamoDbAttributeValue =
    | { readonly B: Uint8Array }
    | { readonly N: string }
    | { readonly S: string };

/**
 * Attributes by name, of an item or of an expression's values.
 */
export type DynamoDbAttributes = Readonly<Record<string, DynamoDbAttributeValue>>;

interface ConditionalInput {
    readonly TableName: string;
    readonly ConditionExpression: string;
    readonly ExpressionAttributeNames: Readonly<Record<string, string>>;
    readonly ExpressionAttributeValues: DynamoDbAttributes;
}

/**
 * What the store sends to `PutItem`.
 */
export interface DynamoDbPutItemInput extends ConditionalInput {
    readonly Item: DynamoDbAttributes;
    readonly ReturnValuesOnConditionCheckFailure: 'ALL_OLD';
}

/**
 * What the store sends to `UpdateItem`.
 */
export interface DynamoDbUpdateItemInput extends ConditionalInput {
    readonly Key: DynamoDbAttributes;
    readonly UpdateExpression: string;
}

/**
 * What the store sends to `DeleteItem`.
 */
export interface DynamoDbDeleteItemInput extends ConditionalInput {
    readonly Key: DynamoDbAttributes;
}

/**
 * The three methods needed from a DynamoDB client. The `DynamoDB` client of `@aws-sdk/client-dynamodb` fits as is
 * (not `DynamoDBClient`, which only has `send`). A failed condition must reject with an error named
 * `ConditionalCheckFailedException` that carries the item it found as `Item`, as that client's errors do. Any other
 * error is passed on as it is.
 */
export interface DynamoDbConnection {
    putItem: (input: DynamoDbPutItemInput) => Promise<unknown>;
    updateItem: (input: DynamoDbUpdateItemInput) => Promise<unknown>;
    deleteItem: (input: DynamoDbDeleteItemInput) => Promise<unknown>;
}

export interface DynamoDbStoreOptions {
    /**
     * Client to send the requests with. The store never closes it.
     */
    readonly connection: DynamoDbConnection;
    /**
     * Name of the table, created with {@link createTableInput}. Defaults to `idempotency_keys`.
     */
    readonly table?: string;
}

/**
 * What {@link createTableInput} gives, to send to `CreateTable`.
 */
export interface DynamoDbCreateTableInput {
    TableName: string;
    AttributeDefinitions: { AttributeName: 'identity'; AttributeType: 'B' }[];
    KeySchema: { AttributeName: 'identity'; KeyType: 'HASH' }[];
    BillingMode: 'PAY_PER_REQUEST';
}

/**
 * What {@link updateTimeToLiveInput} gives, to send to `UpdateTimeToLive`.
 */
export interface DynamoDbUpdateTimeToLiveInput {
    TableName: string;
    TimeToLiveSpecification: { AttributeName: 'ttl'; Enabled: true };
}

const defaultTableName = 'idempotency_keys';
const millisecondsPerSecond = 1000;

/**
 * Every attribute is named through a placeholder, as `token`, `status` and `ttl` are reserved words in expressions.
 */
const names = {
    '#identity': 'identity',
    '#fingerprint': 'fingerprint',
    '#token': 'token',
    '#lease_expires_at': 'lease_expires_at',
    '#expires_at': 'expires_at',
    '#status': 'status',
    '#headers': 'headers',
    '#body': 'body',
} as const;

const claimCondition =
    'attribute_not_exists(#identity) OR #expires_at <= :now OR (#lease_expires_at <= :now AND #fingerprint = :fingerprint)';
const tokenCondition = '#token = :token AND #expires_at > :now';
const completeUpdate =
    'SET #status = :status, #headers = :headers, #body = :body REMOVE #token, #lease_expires_at';

/**
 * The table every implementation shares, as in the spec: the partition key `identity`, bytes, and nothing else
 * declared, billed per request.
 *
 * @param table - Name of the table, `idempotency_keys` by default
 * @returns `CreateTable` input, e.g. for `client.createTable()`
 */
export const createTableInput = (table = defaultTableName): DynamoDbCreateTableInput => ({
    TableName: table,
    AttributeDefinitions: [{ AttributeName: 'identity', AttributeType: 'B' }],
    KeySchema: [{ AttributeName: 'identity', KeyType: 'HASH' }],
    BillingMode: 'PAY_PER_REQUEST',
});

/**
 * Turns on DynamoDB's Time to Live for the `ttl` attribute, so expired items are deleted. Optional: without it,
 * expired items stay until a claim writes over them.
 *
 * @param table - Name of the table, `idempotency_keys` by default
 * @returns `UpdateTimeToLive` input, e.g. for `client.updateTimeToLive()`
 */
export const updateTimeToLiveInput = (table = defaultTableName): DynamoDbUpdateTimeToLiveInput => ({
    TableName: table,
    TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
});

/**
 * Whether the client rejected because a write's condition failed.
 *
 * @param error - What the client rejected with
 * @returns Whether it is a `ConditionalCheckFailedException`
 */
const isConditionFailure = (error: unknown): boolean =>
    (error as { name?: unknown } | null)?.name === 'ConditionalCheckFailedException';

/**
 * Whether a write was made, or failed on its condition. Any other error is thrown again.
 *
 * @param write - The conditional write
 * @returns `true` if it was written, `false` if its condition failed
 * @rejects {unknown} The client's error, unless its condition failed
 */
const wasWritten = async (write: Promise<unknown>): Promise<boolean> => {
    try {
        await write;
        return true;
    } catch (error) {
        if (isConditionFailure(error)) {
            return false;
        }
        throw error;
    }
};

/**
 * An item as a failed claim finds it: unexpired, so a running record, or a completed one.
 */
interface FoundItem {
    readonly fingerprint: { readonly B: Uint8Array };
    readonly status?: { readonly N: string };
    readonly headers?: { readonly S: string };
    readonly body?: { readonly B: Uint8Array };
}

/**
 * The strict store on DynamoDB: a claim is one conditional `PutItem`, so it is exclusive, and DynamoDB keeps it
 * durably. DynamoDB has no clock a condition can read, so every time is this server's (`Date.now()`): `leaseMs` must
 * cover the worst clock drift between servers as well as the slowest handler. An item holds at most 400 KB, so
 * completing with a larger response is an error, which leaves the attempt to its lease.
 */
export class DynamoDbStore implements IdempotencyStore {
    readonly #connection: DynamoDbConnection;
    readonly #table: string;

    public constructor({ connection, table = defaultTableName }: DynamoDbStoreOptions) {
        this.#connection = connection;
        this.#table = table;
    }

    public async claim({
        identity,
        fingerprint,
        token,
        leaseMs,
        ttlMs,
    }: ClaimParams): Promise<ClaimResult> {
        const now = Date.now();
        const expiresAt = now + ttlMs;
        const recordFingerprint = { B: fromHex(fingerprint) };
        try {
            await this.#connection.putItem({
                TableName: this.#table,
                Item: {
                    identity: { B: fromHex(identity) },
                    fingerprint: recordFingerprint,
                    token: { S: token },
                    lease_expires_at: { N: String(now + leaseMs) },
                    expires_at: { N: String(expiresAt) },
                    ttl: { N: String(Math.ceil(expiresAt / millisecondsPerSecond)) },
                },
                ConditionExpression: claimCondition,
                ExpressionAttributeNames: {
                    '#identity': names['#identity'],
                    '#expires_at': names['#expires_at'],
                    '#lease_expires_at': names['#lease_expires_at'],
                    '#fingerprint': names['#fingerprint'],
                },
                ExpressionAttributeValues: {
                    ':now': { N: String(now) },
                    ':fingerprint': recordFingerprint,
                },
                ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
            });
            return { state: 'claimed' };
        } catch (error) {
            // A client that gives back no item can't say what holds the key: its error is passed on
            const item = isConditionFailure(error)
                ? (error as { Item?: FoundItem }).Item
                : undefined;
            if (!item) {
                throw error;
            }
            const foundFingerprint = toHex(item.fingerprint.B);
            return item.status
                ? {
                      state: 'completed',
                      fingerprint: foundFingerprint,
                      response: {
                          status: Number(item.status.N),
                          headers: JSON.parse(item.headers!.S) as StoredResponse['headers'],
                          body: item.body!.B,
                      },
                  }
                : { state: 'running', fingerprint: foundFingerprint };
        }
    }

    public async complete(
        identity: string,
        token: string,
        response: StoredResponse
    ): Promise<boolean> {
        const now = Date.now();
        const update = this.#connection.updateItem({
            TableName: this.#table,
            Key: { identity: { B: fromHex(identity) } },
            UpdateExpression: completeUpdate,
            ConditionExpression: tokenCondition,
            ExpressionAttributeNames: {
                '#status': names['#status'],
                '#headers': names['#headers'],
                '#body': names['#body'],
                '#token': names['#token'],
                '#lease_expires_at': names['#lease_expires_at'],
                '#expires_at': names['#expires_at'],
            },
            ExpressionAttributeValues: {
                ':status': { N: String(response.status) },
                ':headers': { S: JSON.stringify(response.headers) },
                ':body': { B: response.body },
                ':token': { S: token },
                ':now': { N: String(now) },
            },
        });
        return wasWritten(update);
    }

    public async release(identity: string, token: string): Promise<boolean> {
        const now = Date.now();
        const deletion = this.#connection.deleteItem({
            TableName: this.#table,
            Key: { identity: { B: fromHex(identity) } },
            ConditionExpression: tokenCondition,
            ExpressionAttributeNames: {
                '#token': names['#token'],
                '#expires_at': names['#expires_at'],
            },
            ExpressionAttributeValues: {
                ':token': { S: token },
                ':now': { N: String(now) },
            },
        });
        return wasWritten(deletion);
    }
}
