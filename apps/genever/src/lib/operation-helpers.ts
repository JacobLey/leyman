import type { NamedType } from './convert.js';
import type { TsDoc } from './ts-type.js';

/**
 * Names of the helper types, and of the `Operations` type they read, each reserved so no schema's name clashes.
 */
export interface OperationHelperNames {
    readonly operations: string;
    readonly field: string;
    readonly json: string;
    readonly input: string;
    readonly result: string;
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
 * @param names - Reserved names
 * @returns The helper types, in the order they are declared
 */
export const operationHelpers = (names: OperationHelperNames): NamedType[] => {
    const { operations, field, json, input, result } = names;
    const operation = `${operations}[Id]`;
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
            type: [
                `${field}<'body', ${json}<${operation}['requestBody']>>`,
                ...locations.map(
                    location => `${field}<'${location}', ${operation}['parameters']['${location}']>`
                ),
            ].join(' &\n    '),
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
    ];
};
