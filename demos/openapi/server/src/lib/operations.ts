import type { AnySchema, ValidateFunction } from 'ajv';
import { Ajv2020 } from 'ajv/dist/2020.js';
import ajvFormats from 'ajv-formats';
import document from '@leyman/demo-openapi-spec/openapi.json' with { type: 'json' };
import { defaultImport } from 'default-import';

const addFormats = defaultImport(ajvFormats);

interface DocumentParameter {
    readonly name: string;
    readonly in: string;
    readonly required?: boolean;
    readonly schema: AnySchema;
}

interface DocumentOperation {
    readonly operationId: string;
    readonly security: readonly Readonly<Record<string, readonly string[]>>[];
    readonly parameters?: readonly DocumentParameter[];
    readonly requestBody?: {
        readonly content: Readonly<Record<string, { readonly schema: AnySchema }>>;
    };
    readonly responses: Readonly<
        Record<
            string,
            { readonly content?: Readonly<Record<string, { readonly schema: AnySchema }>> }
        >
    >;
}

type DocumentPathItem = Readonly<
    Record<string, DocumentOperation | readonly DocumentParameter[]>
> & {
    readonly parameters?: readonly DocumentParameter[];
};

/**
 * Everything the server needs to know about one operation, from the spec.
 */
export interface Operation {
    readonly operationId: string;
    readonly method: string;
    /**
     * In Hono's syntax: `/notes/:noteId` for the spec's `/notes/{noteId}`.
     */
    readonly route: string;
    /**
     * The scopes a bearer token needs. Every operation in this spec needs one (its tests check it).
     */
    readonly scopes: readonly string[];
    /**
     * Each coerces its strings to the schema's types, and fills in the spec's defaults.
     */
    readonly path: ValidateFunction;
    readonly query: ValidateFunction;
    /**
     * `null` without a request body. Every body in this spec is JSON, and required.
     */
    readonly body: ValidateFunction | null;
    /**
     * By status. Every response in this spec has a JSON body.
     */
    readonly responses: ReadonlyMap<number, ValidateFunction>;
}

const documentId = 'openapi.json';

/**
 * An Ajv that resolves `$ref`s into the spec's `components`.
 *
 * @param options - Whether to coerce strings (parameters arrive as strings), and fill in defaults
 * @returns An Ajv with the spec's components, and its formats
 */
const createAjv = (options: { readonly coerce: boolean }): Ajv2020 => {
    const ajv = new Ajv2020({
        allErrors: true,
        coerceTypes: options.coerce,
        useDefaults: options.coerce,
    });
    addFormats(ajv);
    // The spec is added whole, so references between components resolve as they do in the document. `components`
    // isn't a JSON Schema keyword, so strict mode needs to be told it's not a mistake.
    ajv.addKeyword('components');
    ajv.addSchema({ components: document.components }, documentId);
    return ajv;
};

/**
 * `#/components/...` in an operation means the document's, so it points into the document added to Ajv.
 *
 * @param schema - A schema from the document, outside its components
 * @returns The schema, with its references into the document
 */
const inDocument = (schema: AnySchema): AnySchema =>
    // Every `$ref` in this spec is local (`#/components/...`)
    JSON.parse(JSON.stringify(schema), (key, value: unknown) =>
        key === '$ref' ? `${documentId}${value as string}` : value
    ) as AnySchema;

const parameters = createAjv({ coerce: true });
const bodies = createAjv({ coerce: false });

/**
 * One object schema for an operation's parameters in a location (`path` or `query`), so they validate together.
 *
 * @param location - `path` or `query`
 * @param list - The operation's and its path's parameters
 * @returns Validator
 */
const compileParameters = (
    location: string,
    list: readonly DocumentParameter[]
): ValidateFunction => {
    const inLocation = list.filter(parameter => parameter.in === location);
    return parameters.compile({
        type: 'object',
        properties: Object.fromEntries(
            inLocation.map(({ name, schema }) => [name, inDocument(schema)])
        ),
        required: inLocation.filter(({ required }) => required).map(({ name }) => name),
        additionalProperties: false,
    });
};

/**
 * Every operation in the spec, with its validators compiled once.
 */
export const operations: readonly Operation[] = Object.entries(
    document.paths as unknown as Readonly<Record<string, DocumentPathItem>>
).flatMap(([path, item]) =>
    Object.entries(item)
        // Path-level `parameters` is the one key that isn't an operation
        .filter((entry): entry is [string, DocumentOperation] => !Array.isArray(entry[1]))
        .map(([method, operation]) => {
            const list = [...(item.parameters ?? []), ...(operation.parameters ?? [])];
            const json = operation.requestBody?.content['application/json'];
            return {
                method,
                operationId: operation.operationId,
                route: path.replaceAll(/\{(?<name>\w+)\}/gv, ':$<name>'),
                // Every operation in this spec has one security requirement, on the `bearer` scheme
                scopes: operation.security[0]!.bearer!,
                path: compileParameters('path', list),
                query: compileParameters('query', list),
                body: json ? bodies.compile(inDocument(json.schema)) : null,
                responses: new Map(
                    Object.entries(operation.responses).map(([status, { content }]) => [
                        Number(status),
                        bodies.compile(inDocument(content!['application/json']!.schema)),
                    ])
                ),
            };
        })
);

/**
 * Says why a request or response doesn't match the spec.
 *
 * @param validate - Validator that just failed
 * @param location - What it validated, e.g. `query`
 * @returns Every reason, in one line
 */
export const describeErrors = (validate: ValidateFunction, location: string): string =>
    bodies.errorsText(validate.errors, { dataVar: location });
