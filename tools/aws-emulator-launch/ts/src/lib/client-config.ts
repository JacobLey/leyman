/**
 * What an AWS SDK client needs to reach a running emulator: an `AwsEmulator`, or the same values passed to another
 * process.
 */
export interface AwsEmulatorConnection {
    readonly endpoint: string;
    readonly region: string;
    readonly credentials: {
        readonly accessKeyId: string;
        readonly secretAccessKey: string;
    };
    readonly ca: string;
}

/**
 * The configuration of an AWS SDK for JavaScript v3 client (such as `new DynamoDB(config)`), with every setting the
 * SDK would otherwise read from the environment or `~/.aws/config` fixed.
 */
export interface AwsClientConfig {
    readonly endpoint: string;
    readonly region: string;
    readonly credentials: {
        readonly accessKeyId: string;
        readonly secretAccessKey: string;
    };
    /**
     * The options of the SDK's Node.js handler, which builds its own `https.Agent` from them, trusting only the
     * emulator's certificate authority, and destroys it with the client.
     */
    readonly requestHandler: {
        readonly httpsAgent: {
            readonly ca: string;
        };
    };
    /**
     * The SDK's endpoint rules reject FIPS and dual-stack together with a custom endpoint.
     */
    readonly useFipsEndpoint: false;
    readonly useDualstackEndpoint: false;
    readonly maxAttempts: number;
    readonly retryMode: 'standard';
}

/**
 * The SDK's own default, fixed so `AWS_MAX_ATTEMPTS` can't change it.
 */
const maxAttempts = 3;

/**
 * The configuration of an AWS SDK for JavaScript v3 client of the emulator, which reads nothing from the environment
 * or a profile (`AWS_PROFILE`, `AWS_USE_FIPS_ENDPOINT`, `AWS_MAX_ATTEMPTS`, `AWS_RETRY_MODE` or their
 * `~/.aws/config` settings): it signs with the run's keys and trusts only the emulator's certificate authority. It is
 * a plain object, so this package needs no SDK.
 *
 * @param emulator - The running emulator, or the same values passed to another process
 * @returns A new configuration, for any client of the SDK
 */
export const awsClientConfig = (emulator: AwsEmulatorConnection): AwsClientConfig => ({
    endpoint: emulator.endpoint,
    region: emulator.region,
    credentials: {
        accessKeyId: emulator.credentials.accessKeyId,
        secretAccessKey: emulator.credentials.secretAccessKey,
    },
    requestHandler: { httpsAgent: { ca: emulator.ca } },
    useFipsEndpoint: false,
    useDualstackEndpoint: false,
    retryMode: 'standard',
    maxAttempts,
});
