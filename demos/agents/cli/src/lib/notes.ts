import type { Session, SessionStore } from './session.js';
import { NotesClient } from '@leyman/demo-openapi-client';
import { NotesCliError, NotesCliLoginError } from './errors.js';
import { refresh, requestTimeoutMs } from './oauth.js';

const statusUnauthorized = 401;

/**
 * The notes API, as the logged-in user: `NotesClient`'s `call`, with the login kept good. The access token is
 * refreshed (and the session saved) when it has expired, and once when the API refuses it, so a command never fails
 * for a token a refresh would fix. Every request times out.
 */
export interface Notes {
    readonly call: NotesClient['call'];
}

/**
 * Connects to the API the session is for.
 *
 * @param store - Where the session is
 * @returns The API
 * @rejects {NotesCliLoginError} When nobody is logged in
 */
export const connect = async (store: SessionStore): Promise<Notes> => {
    const session = await store.load();
    if (session === null) {
        throw new NotesCliLoginError('Not logged in. Run notes login --api <url> first.');
    }
    let current: Session = session;
    let hasRenewed = false;
    const renew = async (): Promise<void> => {
        hasRenewed = true;
        // One command refreshes at a time: another may have done it while this one waited
        current = await store.locked(async () => {
            const latest = await store.load();
            if (latest !== null && latest.accessToken !== current.accessToken) {
                return latest;
            }
            const fresh = await refresh(current);
            await store.save(fresh);
            return fresh;
        });
    };
    const client = new NotesClient({
        baseUrl: session.api,
        token: async () => {
            if (current.expiresAt !== null && current.expiresAt <= Date.now()) {
                await renew();
            }
            return current.accessToken;
        },
        fetch: async (input, init) =>
            fetch(input, { ...init, signal: AbortSignal.timeout(requestTimeoutMs) }),
    });
    return {
        call: async (operationId, input) => {
            const result = await client.call(operationId, input);
            // Refused before it expired (revoked, or the API's keys changed), or with no expiry to go by
            if (
                hasRenewed ||
                result.status !== statusUnauthorized ||
                current.refreshToken === null
            ) {
                return result;
            }
            await renew();
            return client.call(operationId, input);
        },
    };
};

/**
 * Statuses that mean the login is the problem: no valid token (`401`), or one without the scope (`403`). Logging in
 * again is the fix for either.
 */
// eslint-disable-next-line @typescript-eslint/no-magic-numbers -- HTTP statuses
const loginRefused: ReadonlySet<number> = new Set([401, 403]);

/**
 * Why the API refused a request, as something to do about it.
 *
 * @param result - The API's answer
 * @param result.status - Its status
 * @param result.body - Its `ApiError`
 * @returns The error to exit with: a login error for the login's statuses
 */
export const refused = (result: {
    readonly status: number;
    readonly body: { readonly message: string };
}): NotesCliError =>
    loginRefused.has(result.status)
        ? new NotesCliLoginError(
              `The API refused the login (${result.body.message}). Run notes login again.`
          )
        : new NotesCliError(`The API refused it: ${result.body.message}`);
