import type { OperationRequest, Operations } from '../generated/api.js';

export type OperationId = keyof Operations;

/**
 * @template Body - A request body or response, as genever wrote it
 */
type JsonBody<Body> = Body extends { content: Record<'application/json', infer Json> }
    ? Json
    : never;

/**
 * What a handler gets, once the request matched the spec: its `path` and `query` parameters, with the spec's
 * defaults filled in (so `limit` is always there), and its JSON `body`, each only if the operation has one.
 * genever's `OperationRequest`, generated with `--parameter-defaults`, as the server's Ajv fills in defaults.
 *
 * @template Id - Which operation, as the spec names it
 */
export type OperationInput<Id extends OperationId> = OperationRequest<Id>;

/**
 * What a handler answers: one of the responses the spec documents for the operation.
 *
 * @template Id - Which operation, as the spec names it
 */
export type OperationResult<Id extends OperationId> = {
    [Status in keyof Operations[Id]['responses']]: Status extends `${infer Code extends number}`
        ? { readonly status: Code; readonly body: JsonBody<Operations[Id]['responses'][Status]> }
        : never;
}[keyof Operations[Id]['responses']];

/**
 * A handler for every operation in the spec: a missing one is a type error.
 */
export type NotesHandlers = {
    readonly [Id in OperationId]: (input: OperationInput<Id>) => Promise<OperationResult<Id>>;
};

/**
 * Whether a bearer token may call the secured operations.
 */
export type Authenticator = (token: string) => boolean | Promise<boolean>;
