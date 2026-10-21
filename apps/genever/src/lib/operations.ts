import type { SchemaObject } from './read-keyword.js';
import type { Target } from './resources.js';
import type { TsDoc, TsIndex, TsProperty, TsType } from './ts-type.js';
import { GeneverInvalidSchemaError } from './errors.js';
import { childPointer } from './pointer.js';
import { readObject } from './read-keyword.js';
import { neverType, stringType, unknownType } from './ts-type.js';

/**
 * What building operation types needs from the converter.
 */
export interface OperationContext {
    /**
     * Type of a schema in the document.
     */
    readonly convert: (schema: unknown, pointer: string) => TsType;
    /**
     * The object a `$ref` refers to.
     */
    readonly resolve: (ref: unknown, refPointer: string) => Target;
}

/**
 * The types of a document's operations, in the shape openapi-typescript generates.
 */
export interface OperationTypes {
    /**
     * Every path, with each of its methods.
     */
    readonly paths: TsType;
    /**
     * Operations with an `operationId`, keyed by it.
     */
    readonly operations: TsType;
    /**
     * The `parameters` of each operation in `operations`, as a validator that fills in defaults leaves them: a
     * parameter whose schema has a `default` is always there.
     */
    readonly requestParameters: TsType;
}

const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;
const parameterLocations = ['query', 'header', 'path', 'cookie'] as const;

interface Parameter {
    readonly name: string;
    readonly location: (typeof parameterLocations)[number];
    readonly required: boolean;
    /**
     * Its schema has a `default`, which a validator that fills in defaults always sets.
     */
    readonly hasDefault: boolean;
    readonly doc: TsDoc | null;
    readonly type: TsType;
}

/**
 * An OpenAPI object, and the JSON Pointer to it.
 */
interface Located {
    readonly value: SchemaObject;
    readonly pointer: string;
}

const objectType = (properties: TsProperty[], index: TsIndex[] = []): TsType => ({
    kind: 'object',
    properties,
    index,
});

const property = (
    name: string,
    type: TsType,
    { optional = false, doc = null }: { optional?: boolean; doc?: TsDoc | null } = {}
): TsProperty => ({ doc, name, optional, type });

const absent = (name: string): TsProperty => property(name, neverType, { optional: true });

/**
 * Documentation of an operation, parameter or header: its `summary`, `description` and `deprecated`.
 *
 * @param value - OpenAPI object
 * @returns documentation, or `null` if there is none
 */
const readOperationDoc = (value: SchemaObject): TsDoc | null => {
    const doc: TsDoc = {
        deprecated: value.deprecated === true,
        description: typeof value.description === 'string' ? value.description : null,
        tags: [],
        title: typeof value.summary === 'string' ? value.summary : null,
    };
    return doc.deprecated || doc.description || doc.title ? doc : null;
};

/**
 * `{ query, header, path, cookie }` of parameters. A location without parameters is `never`, and one
 * whose parameters are all optional is optional.
 *
 * @param parameters - the path item's, then the operation's. A later one replaces an earlier one of the same name and location
 * @returns object with a property for each location
 */
const parametersType = (parameters: readonly Parameter[]): TsType => {
    const byKey = new Map(parameters.map(p => [`${p.location}:${p.name}`, p]));
    const unique = byKey.values().toArray();
    return objectType(
        parameterLocations.map(location => {
            const located = unique.filter(p => p.location === location);
            if (located.length === 0) {
                return absent(location);
            }
            const properties = located.map(p =>
                property(p.name, p.type, { optional: !p.required, doc: p.doc })
            );
            return property(location, objectType(properties), {
                optional: located.every(p => !p.required),
            });
        })
    );
};

/**
 * Builds `Paths` and `Operations` types from an OpenAPI document's `paths`.
 */
class OperationBuilder {
    readonly #context: OperationContext;
    readonly #operationsName: string;
    readonly #operations: TsProperty[] = [];
    readonly #requestParameters: TsProperty[] = [];
    readonly #operationIds = new Set<string>();

    /**
     * @param context - how to convert schemas and resolve references
     * @param operationsName - name of the `Operations` type, which `Paths` refers to
     */
    public constructor(context: OperationContext, operationsName: string) {
        this.#context = context;
        this.#operationsName = operationsName;
    }

    /**
     * Build the types of every operation.
     *
     * @param paths - value of the document's `paths`
     * @returns types
     * @throws {GeneverInvalidSchemaError} if `paths` or an operation is invalid, or two operations share an `operationId`
     */
    public build(paths: unknown): OperationTypes {
        const pathsPointer = childPointer('#', 'paths');
        const pathTypes = Object.entries(readObject(paths, pathsPointer)).map(([path, raw]) => {
            const item = this.#deref(raw, childPointer(pathsPointer, path));
            return property(path, this.#pathItem(item));
        });
        return {
            paths: objectType(pathTypes),
            operations: objectType(this.#operations),
            requestParameters: objectType(this.#requestParameters),
        };
    }

    /**
     * An OpenAPI object, or the object its `$ref` refers to.
     *
     * @param value - object, or reference object
     * @param pointer - JSON Pointer to it
     * @returns the object, and where it is
     */
    #deref(value: unknown, pointer: string): Located {
        const object = readObject(value, pointer);
        if (object.$ref === undefined) {
            return { value: object, pointer };
        }
        const target = this.#context.resolve(object.$ref, childPointer(pointer, '$ref'));
        return { value: readObject(target.schema, target.pointer), pointer: target.pointer };
    }

    /**
     * Type of a media type object: its schema's, or `unknown` without one.
     *
     * @param media - media type object
     * @param pointer - JSON Pointer to it
     * @returns type of the content
     */
    #media(media: unknown, pointer: string): TsType {
        const { schema } = readObject(media, pointer);
        return schema === undefined
            ? unknownType
            : this.#context.convert(schema, childPointer(pointer, 'schema'));
    }

    /**
     * `content` of a request body or response, `{ [mediaType]: type }`, or absent without one.
     *
     * @param located - request body or response
     * @returns `content` property
     */
    #content({ value, pointer }: Located): TsProperty {
        if (value.content === undefined) {
            return absent('content');
        }
        const contentPointer = childPointer(pointer, 'content');
        const media = Object.entries(readObject(value.content, contentPointer)).map(
            ([mediaType, entry]) =>
                property(mediaType, this.#media(entry, childPointer(contentPointer, mediaType)))
        );
        return property('content', objectType(media));
    }

    /**
     * Whether a parameter's schema has a `default`, following `$ref`s to it.
     *
     * @param located - parameter
     * @returns whether it does
     */
    #hasDefault({ value, pointer }: Located): boolean {
        let { schema } = value;
        let schemaPointer = childPointer(pointer, 'schema');
        const seen = new Set<string>();
        while (typeof schema === 'object' && schema !== null && !seen.has(schemaPointer)) {
            seen.add(schemaPointer);
            if ('default' in schema) {
                return true;
            }
            const { $ref } = schema as SchemaObject;
            if ($ref === undefined) {
                return false;
            }
            const target = this.#context.resolve($ref, childPointer(schemaPointer, '$ref'));
            ({ schema } = target);
            schemaPointer = target.pointer;
        }
        return false;
    }

    /**
     * Type of a parameter or header: its `schema`, or the schema of its first `content` entry.
     *
     * @param located - parameter or header
     * @returns value type
     */
    #valueType({ value, pointer }: Located): TsType {
        if (value.schema !== undefined) {
            return this.#context.convert(value.schema, childPointer(pointer, 'schema'));
        }
        if (value.content === undefined) {
            return unknownType;
        }
        const contentPointer = childPointer(pointer, 'content');
        const [entry] = Object.entries(readObject(value.content, contentPointer));
        return entry ? this.#media(entry[1], childPointer(contentPointer, entry[0])) : unknownType;
    }

    /**
     * The parameters of a path item or operation.
     *
     * @param located - path item or operation
     * @returns parameters, in order
     * @throws {GeneverInvalidSchemaError} if `parameters` is not an array, or a parameter has no name or location
     */
    #parameters({ value, pointer }: Located): Parameter[] {
        const { parameters } = value;
        if (parameters === undefined) {
            return [];
        }
        const parametersPointer = childPointer(pointer, 'parameters');
        if (!Array.isArray(parameters)) {
            throw new GeneverInvalidSchemaError('parameters must be an array', {
                pointer: parametersPointer,
            });
        }
        return parameters.map((raw, i) => {
            const located = this.#deref(raw, childPointer(parametersPointer, i));
            const { name, in: location } = located.value;
            if (
                typeof name !== 'string' ||
                !parameterLocations.includes(location as Parameter['location'])
            ) {
                throw new GeneverInvalidSchemaError(
                    `A parameter needs a name, and "in" one of ${parameterLocations.join(', ')}`,
                    { pointer: located.pointer }
                );
            }
            return {
                name,
                location: location as Parameter['location'],
                // Path parameters are always required
                required: location === 'path' || located.value.required === true,
                hasDefault: this.#hasDefault(located),
                doc: readOperationDoc(located.value),
                type: this.#valueType(located),
            };
        });
    }

    #requestBody({ value, pointer }: Located): TsProperty {
        if (value.requestBody === undefined) {
            return absent('requestBody');
        }
        const body = this.#deref(value.requestBody, childPointer(pointer, 'requestBody'));
        return property('requestBody', objectType([this.#content(body)]), {
            optional: body.value.required !== true,
            doc: readOperationDoc(body.value),
        });
    }

    #header(name: string, raw: unknown, headersPointer: string): TsProperty {
        const header = this.#deref(raw, childPointer(headersPointer, name));
        return property(name, this.#valueType(header), {
            optional: header.value.required !== true,
            doc: readOperationDoc(header.value),
        });
    }

    #response(status: string, raw: unknown, responsesPointer: string): TsProperty {
        const response = this.#deref(raw, childPointer(responsesPointer, status));
        const headersPointer = childPointer(response.pointer, 'headers');
        const headers =
            response.value.headers === undefined
                ? []
                : Object.entries(readObject(response.value.headers, headersPointer)).map(
                      ([name, header]) => this.#header(name, header, headersPointer)
                  );
        // Any other header may be sent too
        const headersType = objectType(headers, [{ key: stringType, value: unknownType }]);
        return property(
            status,
            objectType([property('headers', headersType), this.#content(response)]),
            { doc: readOperationDoc(response.value) }
        );
    }

    #operation(operation: Located, parameters: readonly Parameter[]): TsType {
        const { value, pointer } = operation;
        const responsesPointer = childPointer(pointer, 'responses');
        const responses =
            value.responses === undefined
                ? []
                : Object.entries(readObject(value.responses, responsesPointer)).map(
                      ([status, response]) => this.#response(status, response, responsesPointer)
                  );
        return objectType([
            property('parameters', parametersType(parameters)),
            this.#requestBody(operation),
            property('responses', objectType(responses)),
        ]);
    }

    /**
     * A method of a path item: a reference to `Operations` if it has an `operationId`, else its type.
     *
     * @param method - HTTP method
     * @param item - path item
     * @param pathParameters - parameters of the path item
     * @returns method property
     * @throws {GeneverInvalidSchemaError} if the `operationId` is already used
     */
    #method(
        method: (typeof methods)[number],
        item: Located,
        pathParameters: readonly Parameter[]
    ): TsProperty {
        if (item.value[method] === undefined) {
            return absent(method);
        }
        const pointer = childPointer(item.pointer, method);
        const operation = { value: readObject(item.value[method], pointer), pointer };
        const parameters = [...pathParameters, ...this.#parameters(operation)];
        const type = this.#operation(operation, parameters);
        const doc = readOperationDoc(operation.value);
        const { operationId } = operation.value;
        if (typeof operationId !== 'string') {
            return property(method, type, { doc });
        }
        if (this.#operationIds.has(operationId)) {
            throw new GeneverInvalidSchemaError(
                `operationId "${operationId}" is used by more than one operation`,
                { pointer: childPointer(pointer, 'operationId') }
            );
        }
        this.#operationIds.add(operationId);
        this.#operations.push(property(operationId, type, { doc }));
        const defaulted = parameters.map(parameter =>
            parameter.hasDefault ? { ...parameter, required: true } : parameter
        );
        this.#requestParameters.push(property(operationId, parametersType(defaulted)));
        const reference = `${this.#operationsName}[${JSON.stringify(operationId)}]`;
        return property(method, { kind: 'reference', name: reference }, { doc });
    }

    #pathItem(item: Located): TsType {
        const pathParameters = this.#parameters(item);
        return objectType([
            property('parameters', parametersType(pathParameters)),
            ...methods.map(method => this.#method(method, item, pathParameters)),
        ]);
    }
}

/**
 * Types of an OpenAPI document's operations: `Paths`, keyed by path and method, and `Operations`, keyed by
 * `operationId`. Each operation has its `parameters` (by location), `requestBody` and `responses` (by status,
 * with their `headers` and `content` by media type), as openapi-typescript generates them.
 *
 * @param document - OpenAPI document
 * @param context - how to convert schemas and resolve references
 * @param operationsName - name of the `Operations` type
 * @returns types, or `null` if the document has no `paths`
 */
export const operationTypes = (
    document: unknown,
    context: OperationContext,
    operationsName: string
): OperationTypes | null => {
    // An OpenAPI document is always an object
    const { paths } = document as SchemaObject;
    if (paths === undefined) {
        return null;
    }
    const builder = new OperationBuilder(context, operationsName);
    return builder.build(paths);
};
