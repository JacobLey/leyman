import type { Adapter, AdapterFactory, AdapterPayload } from 'oidc-provider';

interface Entry {
    readonly payload: AdapterPayload;
    /**
     * When it's dropped, in milliseconds since the epoch.
     */
    readonly expiresAt: number;
}

const millisecondsPerSecond = 1000;

/**
 * Drops every entry that has expired.
 *
 * @param entries - One model's
 */
const sweep = (entries: Map<string, Entry>): void => {
    const now = Date.now();
    for (const [id, { expiresAt }] of entries) {
        if (expiresAt <= now) {
            entries.delete(id);
        }
    }
};

/**
 * The first unexpired entry that matches.
 *
 * @param entries - One model's
 * @param isMatch - Whether it's the one
 * @returns Its payload, if any matches
 */
const findBy = (
    entries: Map<string, Entry>,
    isMatch: (payload: AdapterPayload) => boolean
): AdapterPayload | undefined => {
    sweep(entries);
    return entries.values().find(({ payload }) => isMatch(payload))?.payload;
};

/**
 * Storage for oidc-provider that keeps everything in this process: restart it and every grant and refresh token is
 * gone. Each model (`AccessToken`, `Session`, ...) has its own entries, dropped once they expire. Oidc-provider
 * checks every model's expiry itself, so dropping them only frees memory.
 *
 * @returns The model's adapter, made once for each
 */
export const memoryAdapter: AdapterFactory = (): Adapter => {
    const entries = new Map<string, Entry>();
    return {
        upsert: async (id, payload, expiresIn) => {
            sweep(entries);
            entries.set(id, {
                payload,
                // Every model here has a lifetime: only a dynamically registered client doesn't, and there are none
                expiresAt: Date.now() + expiresIn! * millisecondsPerSecond,
            });
        },
        find: async id => {
            sweep(entries);
            return entries.get(id)?.payload;
        },
        findByUid: async uid => findBy(entries, payload => payload.uid === uid),
        findByUserCode: async userCode => findBy(entries, payload => payload.userCode === userCode),
        // Without sweeping: oidc-provider consumes what it has just found, even if it expired since
        consume: async id => {
            entries.get(id)!.payload.consumed = Math.floor(Date.now() / millisecondsPerSecond);
        },
        destroy: async id => {
            entries.delete(id);
        },
        revokeByGrantId: async grantId => {
            for (const [id, { payload }] of entries) {
                if (payload.grantId === grantId) {
                    entries.delete(id);
                }
            }
        },
    };
};
