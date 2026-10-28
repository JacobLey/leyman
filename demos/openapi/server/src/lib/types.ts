import type { OperationRequest, Operations } from '@leyman/demo-openapi-spec/notes.openapi.yaml';

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
 * Who a request is from, once its token is accepted.
 */
export interface Caller {
    /**
     * Who the token is for: a user (`sub`), as the authorization server knows them. Each owns their own notes.
     */
    readonly subject: string;
}

/**
 * A handler for every operation in the spec: a missing one is a type error. Each acts for the caller, and sees only
 * the caller's notes.
 */
export type NotesHandlers = {
    readonly [Id in OperationId]: (
        input: OperationInput<Id>,
        caller: Caller
    ) => Promise<OperationResult<Id>>;
};

/**
 * A bearer token is accepted (as its `Caller`) when it is valid and has every scope the operation needs, `invalid`
 * when it isn't valid at all (a `401`), and `insufficient_scope` when it is valid without them (a `403`).
 */
export type Authentication = 'insufficient_scope' | 'invalid' | Caller;

/**
 * Checks a bearer token against the scopes an operation needs.
 */
export type Authenticator = (
    token: string,
    scopes: readonly string[]
) => Authentication | Promise<Authentication>;
