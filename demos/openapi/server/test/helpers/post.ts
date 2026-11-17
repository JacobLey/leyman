/**
 * Posts a note as plain `fetch`, to see the response's headers, which the typed client doesn't return.
 *
 * @param url - Where the server is
 * @param init - The note, whose token, and the key
 * @param init.body - What to send as JSON, a note or not
 * @param init.token - Bearer token
 * @param init.key - `Idempotency-Key`, if any
 * @returns The response
 */
export const postNote = async (
    url: string,
    init: { readonly body: unknown; readonly token: string; readonly key?: string | undefined }
): Promise<Response> =>
    fetch(`${url}/notes`, {
        method: 'POST',
        headers: {
            authorization: `Bearer ${init.token}`,
            'content-type': 'application/json',
            ...(init.key !== undefined && { 'idempotency-key': init.key }),
        },
        body: JSON.stringify(init.body),
    });
