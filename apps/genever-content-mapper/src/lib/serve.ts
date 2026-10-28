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
            const { text, diagnostics } = mapDocument(
                String(params.content),
                String(params.fileName),
                projects.get(params.projectHandle)
            );
            // Synthesized: no span of the types maps back to the document
            return { text, diagnostics, extension: '.ts', mappings: [] };
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
 */
export const serve = async (input: Readable, output: Writable): Promise<void> => {
    const handle = handlers();
    for await (const { id, method, params } of readMessages(input)) {
        if (id === undefined || method === undefined) {
            continue;
        }
        const handler = Object.hasOwn(handle, method) ? handle[method] : undefined;
        writeMessage(
            output,
            handler
                ? { id, jsonrpc: '2.0', result: handler((params ?? {}) as Params) }
                : {
                      id,
                      jsonrpc: '2.0',
                      error: { code: methodNotFound, message: `Unknown method: ${method}` },
                  }
        );
    }
};
