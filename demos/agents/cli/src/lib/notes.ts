import type { SessionStore } from './session.js';
import { NotesClient } from '@leyman/demo-openapi-client';
import { NotesCliError } from './errors.js';
import { refresh } from './oauth.js';

/**
 * The notes API, as the logged-in user. The access token is refreshed (and the session saved) whenever it has
 * expired, so a command never fails for a token a refresh would fix.
 *
 * @param store - Where the session is
 * @returns The client
 * @rejects {NotesCliError} When nobody is logged in
 */
export const connect = async (store: SessionStore): Promise<NotesClient> => {
    const session = await store.load();
    if (session === null) {
        throw new NotesCliError('Not logged in. Run notes login --api <url> first.');
    }
    let current = session;
    const token = async (): Promise<string> => {
        if (current.expiresAt <= Date.now()) {
            const fresh = await refresh(current);
            await store.save(fresh);
            // eslint-disable-next-line require-atomic-updates -- A command makes one request at a time
            current = fresh;
        }
        return current.accessToken;
    };
    return new NotesClient({ baseUrl: session.api, token });
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
 * @returns The error to exit with
 */
export const refused = (result: {
    readonly status: number;
    readonly body: { readonly message: string };
}): NotesCliError =>
    new NotesCliError(
        loginRefused.has(result.status)
            ? `The API refused the login (${result.body.message}). Run notes login again.`
            : `The API refused it: ${result.body.message}`
    );
