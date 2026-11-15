import type { DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import type { AwsClientConfig } from 'aws-emulator-launch';
import { expectTypeOf } from 'expect-type';
import { expect } from '@leyman/expect';
import { awsClientConfig } from 'aws-emulator-launch';
import { suite, test } from 'mocha-chain';

const connection = {
    endpoint: 'https://127.0.0.1:1234',
    region: 'eu-west-3',
    credentials: { accessKeyId: 'EMULATORKEY', secretAccessKey: 'EMULATORSECRET' },
    ca: '-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----\n',
};

suite('awsClientConfig', () => {
    test('Fixes every setting the SDK would read from the environment', () => {
        expect(awsClientConfig(connection)).to.deep.equal({
            endpoint: 'https://127.0.0.1:1234',
            region: 'eu-west-3',
            credentials: { accessKeyId: 'EMULATORKEY', secretAccessKey: 'EMULATORSECRET' },
            requestHandler: { httpsAgent: { ca: connection.ca } },
            useFipsEndpoint: false,
            useDualstackEndpoint: false,
            maxAttempts: 3,
            retryMode: 'standard',
        });
    });

    test('Returns a new object each time', () => {
        const first = awsClientConfig(connection);
        const second = awsClientConfig(connection);

        expect(first).not.to.equal(second);
        expect(first.credentials).not.to.equal(connection.credentials);
    });

    test('Is an SDK client configuration', () => {
        // That the SDK reads `requestHandler` as its Node.js handler's options, rather than its catch-all
        // `Record<string, unknown>`, is shown by a request to the installed emulator, which only trusts its `ca`
        expectTypeOf<AwsClientConfig>().toExtend<DynamoDBClientConfig>();
    });
});
