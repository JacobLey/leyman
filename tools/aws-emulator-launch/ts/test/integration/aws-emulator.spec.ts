import type { Context } from 'mocha';
import { access } from 'node:fs/promises';
import { request } from 'node:https';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { expect } from '@leyman/expect';
import { awsClientConfig, launchAwsEmulator } from 'aws-emulator-launch';
import { before, suite, test } from 'mocha-chain';

/**
 * Sends a request to the emulator, trusting only its certificate authority.
 *
 * @param url - Where to
 * @param ca - Its certificate authority
 * @param init - The method and headers
 * @returns The response's status
 */
const send = async (
    url: string,
    ca: string,
    init: { readonly method?: string; readonly headers?: Readonly<Record<string, string>> } = {}
): Promise<number | undefined> =>
    new Promise((resolve, reject) => {
        const sent = request(url, { ca, ...init }, response => {
            response.resume();
            resolve(response.statusCode);
        });
        sent.once('error', reject);
        sent.end('{}');
    });

suite('launchAwsEmulator with the installed emulator', () => {
    const withEmulator = before(async function (this: Context) {
        // Starts in about 150 ms, which a loaded machine can stretch
        this.timeout(30_000);
        return { emulator: await launchAwsEmulator() };
    });
    withEmulator.after(async ({ emulator }) => {
        await emulator.stop();
    });

    withEmulator.test(
        'Serves its health check over HTTPS, trusting its certificate authority',
        async ({ emulator }) => {
            expect(await send(`${emulator.endpoint}/__admin/health`, emulator.ca)).to.equal(200);
        }
    );

    withEmulator.test(
        'Refuses an unsigned request, since authentication is on',
        async ({ emulator }) => {
            const status = await send(emulator.endpoint, emulator.ca, {
                method: 'POST',
                headers: {
                    'content-type': 'application/x-amz-json-1.0',
                    'x-amz-target': 'DynamoDB_20120810.ListTables',
                },
            });

            expect(status).to.equal(403);
        }
    );

    withEmulator.test(
        'Serves an SDK client of awsClientConfig, whatever the environment says',
        async ({ emulator }) => {
            // Each would break the request, or change how it is retried, if the SDK read it
            const hostile = {
                AWS_USE_FIPS_ENDPOINT: 'true',
                AWS_USE_DUALSTACK_ENDPOINT: 'true',
                AWS_MAX_ATTEMPTS: '1',
                AWS_RETRY_MODE: 'adaptive',
                AWS_REGION: 'eu-central-1',
                AWS_ACCESS_KEY_ID: 'WRONGKEY',
                AWS_SECRET_ACCESS_KEY: 'WRONGSECRET',
            };
            const { env } = process;
            const saved = Object.fromEntries(Object.keys(hostile).map(name => [name, env[name]]));
            Object.assign(env, hostile);
            const dynamodb = new DynamoDB(awsClientConfig(emulator));
            try {
                const { TableNames: tables } = await dynamodb.listTables({});
                expect(tables).to.deep.equal([]);
                expect(await dynamodb.config.maxAttempts()).to.equal(3);
                expect(await dynamodb.config.retryStrategy()).to.include({ mode: 'standard' });
            } finally {
                dynamodb.destroy();
                for (const [name, value] of Object.entries(saved)) {
                    if (value === undefined) {
                        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Restores the environment
                        delete env[name];
                    } else {
                        env[name] = value;
                    }
                }
            }
        }
    );

    withEmulator.test('Reads the region of its config', ({ emulator }) => {
        expect(emulator.region).to.equal('us-east-1');
    });
});

test('The installed emulator deletes its files once stopped', async function (this: Context) {
    this.timeout(30_000);
    const emulator = await launchAwsEmulator();
    await access(emulator.caFile);

    await emulator.stop();

    await expect(access(emulator.caFile)).to.be.rejectedWith(Error, 'ENOENT');
});
