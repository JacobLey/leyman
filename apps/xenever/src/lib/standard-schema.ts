/**
 * The Standard Schema interface ([standardschema.dev](https://standardschema.dev), `@standard-schema/spec`
 * 1.1.0, MIT), copied as its authors suggest rather than depended on: xenever only implements it, so the types
 * are all it needs, and a test checks they still match the package.
 *
 * @template Input - type of the input
 * @template Output - type of the output
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
    /**
     * The Standard Schema properties.
     */
    // eslint-disable-next-line @typescript-eslint/naming-convention -- The name the spec defines
    readonly '~standard': StandardSchemaV1.Props<Input, Output>;
}

// eslint-disable-next-line @typescript-eslint/no-namespace -- The spec's own shape, so `StandardSchemaV1.Result` etc. read as upstream's
export declare namespace StandardSchemaV1 {
    /**
     * The Standard Schema properties interface.
     *
     * @template Input - type of the input
     * @template Output - type of the output
     */
    export interface Props<Input = unknown, Output = Input> {
        readonly version: 1;
        readonly vendor: string;
        readonly validate: (
            value: unknown,
            options?: Options
        ) => Promise<Result<Output>> | Result<Output>;
        readonly types?: Types<Input, Output> | undefined;
    }

    /**
     * The result interface of the validate function.
     *
     * @template Output - type of the output
     */
    export type Result<Output> = FailureResult | SuccessResult<Output>;

    /**
     * The result interface if validation succeeds.
     *
     * @template Output - type of the output
     */
    export interface SuccessResult<Output> {
        readonly value: Output;
        readonly issues?: undefined;
    }

    /**
     * Options for the validate function.
     */
    export interface Options {
        readonly libraryOptions?: Record<string, unknown> | undefined;
    }

    /**
     * The result interface if validation fails.
     */
    export interface FailureResult {
        readonly issues: readonly Issue[];
    }

    /**
     * The issue interface of the failure output.
     */
    export interface Issue {
        readonly message: string;
        readonly path?: readonly (PathSegment | PropertyKey)[] | undefined;
    }

    /**
     * The path segment interface of the issue.
     */
    export interface PathSegment {
        readonly key: PropertyKey;
    }

    /**
     * The Standard Schema types interface.
     *
     * @template Input - type of the input
     * @template Output - type of the output
     */
    export interface Types<Input = unknown, Output = Input> {
        readonly input: Input;
        readonly output: Output;
    }
}
