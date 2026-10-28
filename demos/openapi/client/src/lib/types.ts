import type { Operations } from '@leyman/demo-openapi-spec/notes.openapi.yaml';

export type OperationId = keyof Operations;

/**
 * `{ [key]: value }`, optional when the value may be `undefined`, and left out when there is no value at all
 * (genever writes `never` for a location an operation has no parameters in).
 *
 * @template Key - Property name
 * @template Value - Its type, as genever wrote it
 */
type Field<Key extends string, Value> = [Exclude<Value, undefined>] extends [never]
    ? unknown
    : undefined extends Value
      ? Readonly<Partial<Record<Key, Exclude<Value, undefined>>>>
      : Readonly<Record<Key, Value>>;

/**
 * @template Body - A request body or response, as genever wrote it
 */
type JsonBody<Body> = Body extends { content: Record<'application/json', infer Json> }
    ? Json
    : never;

/**
 * What a call to the operation takes: its `path` and `query` parameters, and its JSON `body`, each only if it has one.
 *
 * @template Id - Which operation, as the spec names it
 */
export type OperationInput<Id extends OperationId> = Field<
    'body',
    JsonBody<Operations[Id]['requestBody']>
> &
    Field<'path', Operations[Id]['parameters']['path']> &
    Field<'query', Operations[Id]['parameters']['query']>;

/**
 * Every response the operation documents, as `{ status, body }`, so a `switch` on `status` narrows `body`.
 *
 * @template Id - Which operation, as the spec names it
 */
export type OperationResult<Id extends OperationId> = {
    [Status in keyof Operations[Id]['responses']]: Status extends `${infer Code extends number}`
        ? { readonly status: Code; readonly body: JsonBody<Operations[Id]['responses'][Status]> }
        : never;
}[keyof Operations[Id]['responses']];
