import type { Session, SessionStore } from './session.js';
import { bearer, compose, kySend } from '@leyman/demo-fetch-middleware';
import { NotesClient } from '@leyman/demo-openapi-client';
import { NotesCliError, NotesCliLoginError } from './errors.js';
import { refresh, requestTimeoutMs } from './oauth.js';

const notLoggedIn = 'Not logged in. Run notes login --api <url> first.';

/**
 * The statuses worth sending a request again for: the API is busy or a gateway failed for a moment.
 */
// eslint-disable-next-line @typescript-eslint/no-magic-numbers -- HTTP statuses
const retryStatuses: readonly number[] = [429, 502, 503, 504];

const maxRetryAfterMs = 30_000;

/**
 * The notes API, as the logged-in user: `NotesClient`'s `call`, with the login kept good. The access token is
 * refreshed (and the session saved) when it has expired, and once when the API refuses it, so a command never fails
 * for a token a refresh would fix. Requests safe to send twice are retried when the network or the API fails for a
 * moment. Every send times out.
 */
export interface Notes {
    readonly call: NotesClient['call'];
}

/**
 * Connects to the API the session is for.
 *
 * @param store - Where the session is
 * @returns The API
 * @rejects {NotesCliLoginError} When nobody is logged in. Its `call` rejects with it too when the login has to be
 * refreshed after `notes logout` forgot it
 */
export const connect = async (store: SessionStore): Promise<Notes> => {
    const session = await store.load();
    if (session === null) {
        throw new NotesCliLoginError(notLoggedIn);
    }
    let current: Session = session;
    let hasRenewed = false;
    const renew = async (): Promise<void> => {
        hasRenewed = true;
        // One command refreshes at a time: another may have done it while this one waited
        current = await store.locked(async () => {
            const latest = await store.load();
            // Logged out meanwhile: refreshing the copy held here would bring the login back
            if (latest === null) {
                throw new NotesCliLoginError(notLoggedIn);
            }
            if (latest.accessToken !== current.accessToken) {
                return latest;
            }
            const fresh = await refresh(current);
            await store.save(fresh);
            return fresh;
        });
    };
    return new NotesClient({
        baseUrl: session.api,
        fetch: compose(
            [
                bearer({
                    token: async () => {
                        if (current.expiresAt !== null && current.expiresAt <= Date.now()) {
                            await renew();
                        }
                        return current.accessToken;
                    },
                    // Refused before it expired (revoked, or the API's keys changed), or with no expiry to go by.
                    // A token renewed already is as good as it gets
                    renew: async () => {
                        if (hasRenewed || current.refreshToken === null) {
                            return null;
                        }
                        await renew();
                        return current.accessToken;
                    },
                }),
            ],
            kySend({
                timeout: requestTimeoutMs,
                retry: {
                    limit: 2,
                    statusCodes: retryStatuses,
                    afterStatusCodes: retryStatuses,
                    maxRetryAfter: maxRetryAfterMs,
                    jitter: true,
                },
            })
        ),
    });
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
