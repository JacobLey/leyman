import type { NamedType } from './convert.js';
import type { TsDoc, TsType } from './ts-type.js';

/**
 * Names of the helper types, and of the `Operations` type they read, each reserved so no schema's name clashes.
 */
export interface OperationHelperNames {
    readonly operations: string;
    readonly field: string;
    readonly json: string;
    readonly input: string;
    readonly result: string;
    /**
     * Only with `parameterDefaults`.
     */
    readonly request?: string;
    readonly requestParameters?: string;
}

const doc = (description: string): TsDoc => ({
    description,
    deprecated: false,
    tags: [],
    title: null,
});

const locations = ['path', 'query', 'header', 'cookie'] as const;

/**
 * Generic types keyed by `operationId`, read from `Operations`: what a call to an operation sends
 * (`OperationInput<'createUser'>`), and the responses it can get back (`OperationResult<'createUser'>`). Keyed by
 * `keyof Operations`, so a misspelled `operationId` is a type error.
 *
 * Written as source: they are the same for every document, other than their names.
 *
 * With `parameterDefaults`, also `OperationRequest<'createUser'>`: what a server's handler gets, once a validator
 * filled in parameters' defaults.
 *
 * @param names - Reserved names
 * @param requestParameters - Each operation's parameters, with defaults filled in
 * @returns The helper types, in the order they are declared
 */
export const operationHelpers = (
    names: OperationHelperNames,
    requestParameters: TsType
): NamedType[] => {
    const {
        operations,
        field,
        json,
        input,
        result,
        request,
        requestParameters: parametersName,
    } = names;
    const operation = `${operations}[Id]`;
    /**
     * Source of `{ body } & { path } & { query } ...`, each only if the operation has it.
     *
     * @param parametersOf - type of an operation's `parameters`
     * @returns intersection of the fields
     */
    const fields = (parametersOf: string): string =>
        [
            `${field}<'body', ${json}<${operation}['requestBody']>>`,
            ...locations.map(location => `${field}<'${location}', ${parametersOf}['${location}']>`),
        ].join(' &\n    ');
    const requestTypes: NamedType[] =
        request !== undefined && parametersName !== undefined
            ? [
                  {
                      doc: doc(
                          "Each operation's `parameters`, as a validator that fills in defaults leaves them."
                      ),
                      exported: false,
                      name: parametersName,
                      type: requestParameters,
                  },
                  {
                      doc: doc(
                          "What a server's handler gets for an operation, once a validator that fills in defaults (such as Ajv's `useDefaults`) has run: as `OperationInput`, but a parameter whose schema has a `default` is always there."
                      ),
                      name: request,
                      parameters: `<Id extends keyof ${operations}>`,
                      type: fields(`${parametersName}[Id]`),
                  },
              ]
            : [];
    return [
        {
            doc: doc(
                '`{ [Key]: Value }`, optional when `Value` may be `undefined`, and left out when there is no `Value`.'
            ),
            exported: false,
            name: field,
            parameters: '<Key extends string, Value>',
            type: [
                '[Exclude<Value, undefined>] extends [never]',
                '    ? unknown',
                '    : undefined extends Value',
                '      ? { readonly [K in Key]?: Exclude<Value, undefined> }',
                '      : { readonly [K in Key]: Value }',
            ].join('\n'),
        },
        {
            doc: doc(
                'The JSON content of a request body or response: `undefined` when it has none, or may be left out.'
            ),
            exported: false,
            name: json,
            parameters: '<Body>',
            type: "Body extends { content: { 'application/json': infer Json } } ? Json : undefined",
        },
        {
            doc: doc(
                'What a call to an operation sends: its parameters by location, and its JSON `body`, each only if it has them.'
            ),
            name: input,
            parameters: `<Id extends keyof ${operations}>`,
            type: fields(`${operation}['parameters']`),
        },
        {
            doc: doc(
                'Every response an operation documents, as `{ status, body }`, so checking `status` narrows `body`. A status that is not a number (`default`, `2XX`) is `number`.'
            ),
            name: result,
            parameters: `<Id extends keyof ${operations}>`,
            type: [
                '{',
                `    [Status in keyof ${operation}['responses']]: {`,
                // eslint-disable-next-line no-template-curly-in-string -- A template literal type, as TypeScript source
                '        readonly status: Status extends `${infer Code extends number}` ? Code : number;',
                `        readonly body: ${json}<${operation}['responses'][Status]>;`,
                '    };',
                `}[keyof ${operation}['responses']]`,
            ].join('\n'),
        },
        ...requestTypes,
    ];
};
