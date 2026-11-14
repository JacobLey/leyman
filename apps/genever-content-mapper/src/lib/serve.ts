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
class ProtocolError extends Error {
    public readonly code: number;

    /**
     * @param message - what is wrong with the request
     * @param options - details of the error
     * @param options.code - JSON-RPC error code
     */
    public constructor(message: string, options: ErrorOptions & { readonly code: number }) {
        super(message, options);
        this.name = 'ProtocolError';
        this.code = options.code;
    }
}

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
const handlers = (): Readonly<Record<string, (params: Params) => unknown>> => {
    const projects = new Map<unknown, MapperOptions>();
    return {
        // JavaScript string indices, as the `yaml` package's ranges are
        initialize: () => ({ positionEncoding: 'utf-16', diagnosticSource }),
        openProject: params => {
            const { options, diagnostics } = parseOptions(params.options);
            projects.set(params.projectHandle, options);
            return { optionDiagnostics: diagnostics };
        },
        closeProject: params => {
            projects.delete(params.projectHandle);
            return null;
        },
        transform: params => {
            const options = projects.get(params.projectHandle);
            // Default options would hide a mistake in TypeScript's bookkeeping, or the mapper's
            if (!options) {
                throw new ProtocolError(
                    `Unknown projectHandle: ${JSON.stringify(params.projectHandle)}`,
                    { code: invalidParams }
                );
            }
            const { text, diagnostics, mappings } = mapDocument(
                String(params.content),
                String(params.fileName),
                options
            );
            return { text, diagnostics, mappings, extension: '.ts' };
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
 * @rejects {Error} if a message's header has no `Content-Length`, or a handler fails other than on a bad request
 */
export const serve = async (input: Readable, output: Writable): Promise<void> => {
    const handle = handlers();
    for await (const { id, method, params } of readMessages(input)) {
        if (id === undefined || method === undefined) {
            continue;
        }
        const handler = Object.hasOwn(handle, method) ? handle[method] : undefined;
        try {
            if (!handler) {
                throw new ProtocolError(`Unknown method: ${method}`, { code: methodNotFound });
            }
            writeMessage(output, {
                id,
                jsonrpc: '2.0',
                result: handler((params ?? {}) as Params),
            });
        } catch (error) {
            if (!(error instanceof ProtocolError)) {
                throw error;
            }
            writeMessage(output, {
                id,
                jsonrpc: '2.0',
                error: { code: error.code, message: error.message },
            });
        }
    }
};
