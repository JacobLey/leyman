// Fakes around the real client, for what AWS Emulator can't produce: it has no fault injection, every entry failure it
// can be made to report is one AWS classifies as not retryable, and it can't lose a response. Each wraps the
// emulator's client, so whatever does get sent is still delivered for real.
import type { PutEventsClient } from '@leyman/demo-outbox-relay';

/**
 * FAKE: holds back the first entry and reports it throttled, as EventBridge does under load. Needs two entries or
 * more, since the rest go to the real client.
 *
 * @param client - Real client
 * @returns Client throttling the first entry of every call
 */
export const throttleFirst = (client: PutEventsClient): PutEventsClient => ({
    putEvents: async ({ Entries: entries = [] }) => {
        const [, ...rest] = entries;
        const output = await client.putEvents({ Entries: rest });
        return {
            ...output,
            FailedEntryCount: output.FailedEntryCount! + 1,
            Entries: [
                { ErrorCode: 'ThrottlingException', ErrorMessage: 'Rate exceeded' },
                ...output.Entries!,
            ],
        };
    },
});

/**
 * FAKE: reports every entry throttled, sending nothing.
 *
 * @returns Client that always throttles
 */
export const throttleAll = (): PutEventsClient => ({
    putEvents: async ({ Entries: entries = [] }) => ({
        $metadata: {},
        FailedEntryCount: entries.length,
        Entries: entries.map(() => ({
            ErrorCode: 'ThrottlingException',
            ErrorMessage: 'Rate exceeded',
        })),
    }),
});

/**
 * FAKE: sends for real, then fails as if the connection dropped before the response arrived.
 *
 * @param client - Real client
 * @returns Client whose calls deliver and then reject
 */
export const sendThenFail = (client: PutEventsClient): PutEventsClient => ({
    putEvents: async input => {
        await client.putEvents(input);
        throw new Error('Connection reset after the request was sent');
    },
});

/**
 * FAKE: rejects the first call without sending, then passes calls through.
 *
 * @param client - Real client
 * @param error - What the first call rejects with
 * @returns Client failing once
 */
export const failOnce = (client: PutEventsClient, error: Error): PutEventsClient => {
    let isFailed = false;
    return {
        putEvents: async input => {
            if (!isFailed) {
                isFailed = true;
                throw error;
            }
            return client.putEvents(input);
        },
    };
};

/**
 * Not a fake: the real client, with its first call held until `release` is called, to act while a drain is mid-send.
 *
 * @param client - Real client
 * @returns Client, a promise that the first call started, and the release
 */
export const holdFirst = (
    client: PutEventsClient
): { client: PutEventsClient; started: Promise<void>; release: () => void } => {
    const started = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<void>();
    let isHeld = false;
    return {
        client: {
            putEvents: async input => {
                if (!isHeld) {
                    isHeld = true;
                    started.resolve();
                    await gate.promise;
                }
                return client.putEvents(input);
            },
        },
        started: started.promise,
        release: () => {
            gate.resolve();
        },
    };
};
