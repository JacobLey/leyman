import type { ClaimParams, ClaimResult, IdempotencyStore, StoredResponse } from 'idempotency-keys';

type MemoryRecord = { readonly fingerprint: string; readonly expiresAt: number } & (
    | {
          readonly state: 'completed';
          readonly status: number;
          readonly headers: StoredResponse['headers'];
          readonly body: readonly number[];
      }
    | { readonly state: 'running'; readonly token: string; readonly leaseExpiresAt: number }
);

/**
 * Stands in for a round trip to an external store, so time passes between a claim and its complete, as it would.
 *
 * @returns Resolves after a few milliseconds
 */
const roundTrip = async (): Promise<void> =>
    new Promise(resolve => {
        setTimeout(resolve, 2);
    });

/**
 * A store in one process's memory, as an example of the store contract. Each record is kept as JSON, as an external
 * store would hold it, so nothing is shared by reference, and each operation first waits a few milliseconds, as a
 * round trip would. Every time is this process's clock.
 */
export class MemoryStore implements IdempotencyStore {
    readonly #records = new Map<string, string>();

    public async claim({
        identity,
        fingerprint,
        token,
        leaseMs,
        ttlMs,
    }: ClaimParams): Promise<ClaimResult> {
        await roundTrip();
        // Nothing awaits from here to the write, so no other operation runs in between: the claim is atomic
        const now = Date.now();
        const record = this.#read(identity, now);
        const isTakeover =
            record?.state === 'running' &&
            record.leaseExpiresAt <= now &&
            record.fingerprint === fingerprint;
        if (record === undefined || isTakeover) {
            const lease = { token, leaseExpiresAt: now + leaseMs, expiresAt: now + ttlMs };
            this.#write(identity, { state: 'running', fingerprint, ...lease });
            return { state: 'claimed' };
        }
        if (record.state === 'running') {
            return { state: 'running', fingerprint: record.fingerprint };
        }
        const { status, headers, body } = record;
        const response = { status, headers, body: Uint8Array.from(body) };
        return { state: 'completed', fingerprint: record.fingerprint, response };
    }

    public async complete(
        identity: string,
        token: string,
        { status, headers, body }: StoredResponse
    ): Promise<boolean> {
        await roundTrip();
        const record = this.#read(identity, Date.now());
        if (record?.state !== 'running' || record.token !== token) {
            return false;
        }
        const { fingerprint, expiresAt } = record;
        const completed = { fingerprint, expiresAt, status, headers, body: [...body] };
        this.#write(identity, { state: 'completed', ...completed });
        return true;
    }

    public async release(identity: string, token: string): Promise<boolean> {
        await roundTrip();
        const record = this.#read(identity, Date.now());
        if (record?.state !== 'running' || record.token !== token) {
            return false;
        }
        this.#records.delete(identity);
        return true;
    }

    /**
     * Reads a record. One past its `ttlMs` stays in the map, to be overwritten by the next claim, but reads as absent.
     *
     * @param identity - The record's identity
     * @param now - The current time, in milliseconds
     * @returns The record, unless absent or expired
     */
    #read(identity: string, now: number): MemoryRecord | undefined {
        const json = this.#records.get(identity);
        if (json === undefined) {
            return undefined;
        }
        const record = JSON.parse(json) as MemoryRecord;
        return record.expiresAt > now ? record : undefined;
    }

    #write(identity: string, record: MemoryRecord): void {
        this.#records.set(identity, JSON.stringify(record));
    }
}
