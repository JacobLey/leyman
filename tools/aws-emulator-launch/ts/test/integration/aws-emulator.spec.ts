import type { Context } from 'mocha';
import { access } from 'node:fs/promises';
import { request } from 'node:https';
import { expect } from '@leyman/expect';
import { launchAwsEmulator } from 'aws-emulator-launch';
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
