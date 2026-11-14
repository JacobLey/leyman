import type { Readable, Writable } from 'node:stream';
import type { MapperOptions } from './options.js';
import { mapDocument } from './map-document.js';
import { parseOptions } from './options.js';
import { readMessages, writeMessage } from './protocol.js';

/**
 * JSON-RPC error code of a request for a method the mapper doesn't have.
 */
const methodNotFound = -32_601;

/**
 * JSON-RPC error code of a request whose params are wrong, such as a project that isn't open.
 */
const invalidParams = -32_602;

/**
 * A request the mapper can't answer, reported to TypeScript as a JSON-RPC error rather than a result.
 */
interface ProtocolError {
    readonly error: { readonly code: number; readonly message: string };
}

/**
 * Answer a request with a JSON-RPC error.
 *
 * @param code - JSON-RPC error code
 * @param message - what is wrong with the request
 * @returns the error response's payload
 */
const protocolError = (code: number, message: string): ProtocolError => ({
    error: { code, message },
});

/**
 * Prefix TypeScript shows before each of the mapper's diagnostic codes.
 */
export const diagnosticSource = 'genever';

type Params = Readonly<Record<string, unknown>>;

/**
 * Request handlers, keeping each project's options until TypeScript closes it.
 *
 * @returns handler of each method
 */
const handlers = (): Readonly<
    Record<string, (params: Params) => ProtocolError | { readonly result: unknown }>
> => {
    const projects = new Map<unknown, MapperOptions>();
    return {
        // JavaScript string indices, as the `yaml` package's ranges are
        initialize: () => ({ result: { positionEncoding: 'utf-16', diagnosticSource } }),
        openProject: params => {
            const { options, diagnostics } = parseOptions(params.options);
            projects.set(params.projectHandle, options);
            return { result: { optionDiagnostics: diagnostics } };
        },
        closeProject: params => {
            projects.delete(params.projectHandle);
            return { result: null };
        },
        transform: params => {
            const options = projects.get(params.projectHandle);
            // Default options would hide a mistake in TypeScript's bookkeeping, or the mapper's
            if (!options) {
                return protocolError(
                    invalidParams,
                    `Unknown projectHandle: ${JSON.stringify(params.projectHandle)}`
                );
            }
            const { content, fileName } = params;
            if (typeof content !== 'string' || typeof fileName !== 'string') {
                return protocolError(
                    invalidParams,
                    'transform needs a string content and fileName'
                );
            }
            const { text, diagnostics, mappings } = mapDocument(content, fileName, options);
            return { result: { text, diagnostics, mappings, extension: '.ts' } };
        },
    };
};

/**
 * Run the content mapper over a pair of streams: TypeScript writes requests to `input`, and reads responses from
 * `output`. Notifications are ignored.
 *
 * @param input - stream of requests (the mapper process's stdin)
 * @param output - stream of responses (the mapper process's stdout)
 * @returns promise that resolves once `input` ends
 * @rejects {Error} if a message's header has no `Content-Length`, or a handler fails other than on a bad request (a bug)
 */
export const serve = async (input: Readable, output: Writable): Promise<void> => {
    const handle = handlers();
    for await (const { id, method, params } of readMessages(input)) {
        if (id === undefined || method === undefined) {
            continue;
        }
        const handler = Object.hasOwn(handle, method) ? handle[method] : undefined;
        const response = handler
            ? handler((params ?? {}) as Params)
            : protocolError(methodNotFound, `Unknown method: ${method}`);
        writeMessage(output, { id, jsonrpc: '2.0', ...response });
    }
};
