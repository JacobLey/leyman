import type { OperationId, OperationInput, OperationResult } from './types.js';
import document from '@leyman/demo-openapi-spec/openapi.json' with { type: 'json' };
import { NotesClientUnexpectedStatusError } from './errors.js';

export interface NotesClientOptions {
    /**
     * Where the API is served, e.g. `http://localhost:3000`. Paths in the spec are appended to it.
     */
    readonly baseUrl: string | URL;
    /**
     * Bearer token, sent with every operation: the spec secures them all. A function is called before each request,
     * so a token that expires can be refreshed.
     */
    readonly token?: string | (() => string | Promise<string | undefined> | undefined) | undefined;
    /**
     * Makes the requests.
     *
     * @default globalThis.fetch
     */
    readonly fetch?: typeof fetch | undefined;
}

interface Route {
    readonly method: string;
    readonly path: string;
    readonly statuses: ReadonlySet<number>;
}

interface DocumentOperation {
    readonly operationId: string;
    readonly responses: Readonly<Record<string, unknown>>;
}

/**
 * Every operation's method and path, read from the spec itself, so a route can't drift from it.
 */
const routes: ReadonlyMap<string, Route> = new Map(
    Object.entries(
        document.paths as Record<string, Record<string, DocumentOperation | unknown[]>>
    ).flatMap(([path, item]) =>
        Object.entries(item)
            // Path-level `parameters` is the one key that isn't an operation
            .filter((entry): entry is [string, DocumentOperation] => !Array.isArray(entry[1]))
            .map(([method, operation]) => [
                operation.operationId,
                {
                    path,
                    method: method.toUpperCase(),
                    statuses: new Set(Object.keys(operation.responses).map(Number)),
                },
            ])
    )
);

/**
 * A typed client for the notes API: one generic `call`, typed by the operations genever generated from the spec.
 */
export class NotesClient {
    readonly #baseUrl: URL;
    readonly #token: () => string | Promise<string | undefined> | undefined;
    readonly #fetch: typeof fetch;

    public constructor(options: NotesClientOptions) {
        // A trailing slash, so the spec's paths are appended to the base path rather than replacing it
        this.#baseUrl = new URL(String(options.baseUrl).replace(/\/?$/v, '/'));
        const { token } = options;
        this.#token = typeof token === 'function' ? token : () => token;
        this.#fetch = options.fetch ?? fetch;
    }

    /**
     * Calls an operation.
     *
     * @param operationId - Operation, as named in the spec
     * @param input - Its `path` and `query` parameters, and `body`
     * @returns The response, as `{ status, body }`
     * @rejects {NotesClientUnexpectedStatusError} When the status isn't one the spec documents for the operation
     */
    public async call<Id extends OperationId>(
        operationId: Id,
        input: OperationInput<Id>
    ): Promise<OperationResult<Id>> {
        const route = routes.get(operationId)!;
        const { path, query, body } = input as {
            readonly path?: Readonly<Record<string, string>>;
            readonly query?: Readonly<Record<string, number | string | undefined>>;
            readonly body?: unknown;
        };

        const url = new URL(
            route.path
                .slice(1)
                .replaceAll(/\{(?<name>\w+)\}/gv, (_match, name: string) =>
                    encodeURIComponent(path![name]!)
                ),
            this.#baseUrl
        );
        if (query) {
            const parameters = Object.entries(query);
            for (const [name, value] of parameters) {
                if (value !== undefined) {
                    url.searchParams.set(name, String(value));
                }
            }
        }

        const headers = new Headers({ accept: 'application/json' });
        if (body !== undefined) {
            headers.set('content-type', 'application/json');
        }
        const token = await this.#token();
        if (token !== undefined) {
            headers.set('authorization', `Bearer ${token}`);
        }

        const response = await this.#fetch(url, {
            method: route.method,
            headers,
            ...(body !== undefined && { body: JSON.stringify(body) }),
        });
        if (!route.statuses.has(response.status)) {
            throw new NotesClientUnexpectedStatusError(operationId, response.status);
        }
        const json: unknown = await response.json();
        return { status: response.status, body: json } as OperationResult<Id>;
    }
}
